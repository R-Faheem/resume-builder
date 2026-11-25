import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pipeline } from 'node:stream/promises';
import Resume from './Resume.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 60000);
const AI_REQUEST_TIMEOUT_SECONDS = Math.ceil(AI_REQUEST_TIMEOUT_MS / 1000);
const AI_RATE_LIMIT_MAX_REQUESTS = Number(process.env.AI_RATE_LIMIT_MAX_REQUESTS || 5);
const AI_RATE_LIMIT_WINDOW_MS = Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 60000);
if (
  !Number.isSafeInteger(AI_REQUEST_TIMEOUT_MS)
  || AI_REQUEST_TIMEOUT_MS < 1
  || !Number.isSafeInteger(AI_RATE_LIMIT_MAX_REQUESTS)
  || AI_RATE_LIMIT_MAX_REQUESTS < 1
  || !Number.isSafeInteger(AI_RATE_LIMIT_WINDOW_MS)
  || AI_RATE_LIMIT_WINDOW_MS < 1
) {
  throw new Error('AI timeout and rate limit settings must be positive integers.');
}
const aiRequestTimes = [];

function limitAiRequests(req, res, next) {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) return next();

  const now = Date.now();
  while (aiRequestTimes.length && aiRequestTimes[0] <= now - AI_RATE_LIMIT_WINDOW_MS) {
    aiRequestTimes.shift();
  }
  if (aiRequestTimes.length >= AI_RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((aiRequestTimes[0] + AI_RATE_LIMIT_WINDOW_MS - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: `AI review limit reached. Try again in ${retryAfter} seconds.`,
    });
  }

  aiRequestTimes.push(now);
  return next();
}

// ---- MongoDB (optional: the app still runs without it, but Save is disabled)
let dbReady = false;
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => { dbReady = true; console.log('MongoDB connected'); })
    .catch((e) => console.error('MongoDB error:', e.message));
} else {
  console.warn('MONGODB_URI not set: saving is disabled');
}
const needDb = (req, res, next) =>
  dbReady ? next() : res.status(503).json({ error: 'Database not connected. Set MONGODB_URI.' });

// ---- Resume CRUD
app.post('/api/resumes', needDb, async (req, res) => {
  try { res.json(await Resume.create(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/resumes/:id', needDb, async (req, res) => {
  try { res.json(await Resume.findByIdAndUpdate(req.params.id, req.body, { new: true })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/resumes/:id', needDb, async (req, res) => {
  try {
    const doc = await Resume.findById(req.params.id);
    doc ? res.json(doc) : res.status(404).json({ error: 'Resume not found' });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ---- AI suggestions
function builtInReview(resume = {}) {
  const suggestions = [];
  const value = (field) => (typeof field === 'string' ? field.trim() : '');
  const jobs = Array.isArray(resume.experience) ? resume.experience : [];
  const skills = value(resume.skills).split(',').map((skill) => skill.trim()).filter(Boolean);

  if (!value(resume.name)) {
    suggestions.push({ section: 'Contact', issue: 'Your name is missing.', fix: 'Add your full name at the top of the resume.' });
  }
  if (!value(resume.email) && !value(resume.phone)) {
    suggestions.push({ section: 'Contact', issue: 'There is no email address or phone number.', fix: 'Add at least one reliable way for employers to contact you.' });
  }
  if (value(resume.summary).length < 40) {
    suggestions.push({ section: 'Summary', issue: 'Your professional summary is missing or very brief.', fix: 'Write 2–3 focused sentences describing your experience, strengths, and the role you want.' });
  }
  if (skills.length < 3) {
    suggestions.push({ section: 'Skills', issue: 'The skills section has fewer than three listed skills.', fix: 'Add relevant tools and skills that are also supported by your experience.' });
  }
  if (!jobs.some((job) => value(job?.role) && value(job?.company))) {
    suggestions.push({ section: 'Experience', issue: 'No experience entry includes both a role and an employer.', fix: 'For each position, include your job title, organization, and dates.' });
  } else if (!jobs.some((job) => /\d/.test(value(job?.bullets)))) {
    suggestions.push({ section: 'Experience', issue: 'Your achievements do not include measurable outcomes yet.', fix: 'Where accurate, add scale or results such as time saved, customers supported, or percentage growth.' });
  }
  if (!(Array.isArray(resume.education) && resume.education.some((item) => value(item?.degree) || value(item?.school)))) {
    suggestions.push({ section: 'Education', issue: 'Education or relevant training is not listed.', fix: 'Add a degree, school, or relevant qualification if applicable.' });
  }
  if (suggestions.length < 4) {
    suggestions.push({
      section: 'Tailoring',
      issue: 'The resume has not been tailored to a specific job description.',
      fix: 'Compare the posting with your experience and include matching skills and terminology only when accurate.',
    });
  }

  return {
    source: 'built-in',
    suggestions: suggestions.slice(0, 3)
      .map(({ section, fix }) => `- ${section}: ${fix}`)
      .join('\n'),
  };
}

app.post('/api/ai/suggest', limitAiRequests, async (req, res) => {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!geminiKey && !openAiKey) return res.json(builtInReview(req.body));

  try {
    const instructions = [
      'You are a resume coach. Give up to 3 short, practical suggestions to improve this resume.',
      'Use plain text with one bullet per suggestion. Do not rewrite the resume, compare versions, or return JSON.',
      'Do not invent facts; suggest adding measurable results only when accurate.',
    ].join(' ');
    const resume = req.body || {};
    const resumeForReview = {
      summary: resume.summary,
      skills: resume.skills,
      experience: Array.isArray(resume.experience)
        ? resume.experience.map((job) => ({
          role: job?.role,
          company: job?.company,
          bullets: job?.bullets,
        }))
        : [],
      education: Array.isArray(resume.education)
        ? resume.education.map((item) => ({
          degree: item?.degree,
          school: item?.school,
        }))
        : [],
    };
    const resumeText = JSON.stringify(resumeForReview);
    let response;
    let content;

    if (geminiKey) {
      const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: instructions }] },
            contents: [{ role: 'user', parts: [{ text: resumeText }] }],
            generationConfig: {
              maxOutputTokens: 300,
            },
          }),
          signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || `Gemini request failed (${response.status})`);
      content = result.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('');
    } else {
      const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: resumeText },
          ],
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || `OpenAI request failed (${response.status})`);
      content = result.choices?.[0]?.message?.content;
    }

    const suggestions = typeof content === 'string' ? content.trim() : '';
    if (!suggestions) throw new Error('The AI provider returned an empty response.');
    res.json({ source: 'ai', suggestions });
  } catch (e) {
    const timedOut = e.name === 'TimeoutError' || e.name === 'AbortError';
    res.status(timedOut ? 504 : 500).json({
      error: timedOut ? `The AI review took longer than ${AI_REQUEST_TIMEOUT_SECONDS} seconds. Please try again.` : e.message || 'AI request failed',
    });
  }
});

// ---- PDF export
app.post('/api/export/pdf', async (req, res) => {
  const r = req.body || {};
  const outputDir = path.join(__dirname, '..', 'generated pdf');
  const safeName = (r.name || 'resume').normalize('NFKD').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'resume';
  const fileName = `${safeName}_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`;
  const filePath = path.join(outputDir, fileName);

  try {
    await fs.promises.mkdir(outputDir, { recursive: true });
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const writeComplete = pipeline(doc, fs.createWriteStream(filePath));

    const section = (title) => {
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(11).fillColor('#1d4e5f').text(title);
      const y = doc.y + 2;
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#1d4e5f').lineWidth(0.8).stroke();
      doc.moveDown(0.5).fillColor('#222');
    };

    doc.font('Helvetica-Bold').fontSize(24).fillColor('#111').text(r.name || 'Your Name');
    doc.font('Helvetica').fontSize(10).fillColor('#555')
      .text([r.email, r.phone, r.location].filter(Boolean).join('   |   '));

    if (r.summary) { section('Summary'); doc.font('Helvetica').fontSize(10.5).text(r.summary); }

    if (r.skills) { section('Skills'); doc.font('Helvetica').fontSize(10.5).text(r.skills.split(',').map(s => s.trim()).filter(Boolean).join('  •  ')); }

    const jobs = (r.experience || []).filter(j => j.company || j.role);
    if (jobs.length) {
      section('Experience');
      jobs.forEach((j) => {
        doc.font('Helvetica-Bold').fontSize(11).text(`${j.role || ''}${j.company ? ' — ' + j.company : ''}`);
        doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#666').text([j.start, j.end].filter(Boolean).join(' – '));
        doc.fillColor('#222').font('Helvetica').fontSize(10.5);
        (j.bullets || '').split('\n').map(b => b.trim()).filter(Boolean)
          .forEach(b => doc.text('•  ' + b, { indent: 8 }));
        doc.moveDown(0.5);
      });
    }

    const projects = (r.projects || []).filter(project => project.name || project.role || project.description);
    if (projects.length) {
      section('Projects');
      projects.forEach((project) => {
        doc.font('Helvetica-Bold').fontSize(11).text(`${project.name || ''}${project.role ? ' — ' + project.role : ''}`);
        doc.font('Helvetica').fontSize(10.5).fillColor('#222');
        if (project.technologies) doc.text(`Technologies: ${project.technologies}`);
        if (project.url) doc.text(project.url);
        (project.description || '').split('\n').map(line => line.trim()).filter(Boolean)
          .forEach(line => doc.text('•  ' + line, { indent: 8 }));
        doc.moveDown(0.5);
      });
    }

    const edu = (r.education || []).filter(e => e.school || e.degree);
    if (edu.length) {
      section('Education');
      edu.forEach((e) => {
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#222')
          .text(`${e.degree || ''}${e.school ? ' — ' + e.school : ''}${e.year ? '  (' + e.year + ')' : ''}`);
      });
    }

    const certificates = (r.certificates || []).filter(certificate => certificate.name || certificate.issuer);
    if (certificates.length) {
      section('Certifications');
      certificates.forEach((certificate) => {
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#222').text(certificate.name || certificate.issuer);
        doc.font('Helvetica').fontSize(10).fillColor('#555')
          .text([certificate.issuer, certificate.issueDate, certificate.credentialId && `Credential ID: ${certificate.credentialId}`].filter(Boolean).join('  |  '));
        if (certificate.url) doc.text(certificate.url);
      });
    }

    doc.end();
    await writeComplete;
    res.download(filePath, fileName, (error) => {
      if (error && !res.headersSent) res.status(500).json({ error: 'PDF was saved, but the download could not be started.' });
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'PDF export failed.' });
  }
});

// ---- Serve the built React app in production
const dist = path.join(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
