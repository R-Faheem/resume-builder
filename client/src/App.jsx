import { useEffect, useState } from 'react';

const emptyJob = { company: '', role: '', start: '', end: '', bullets: '' };
const emptyEdu = { school: '', degree: '', year: '' };
const emptyCertificate = { name: '', issuer: '', issueDate: '', credentialId: '', url: '' };
const emptyProject = { name: '', role: '', technologies: '', url: '', description: '' };
const initial = {
  name: '', email: '', phone: '', location: '', summary: '', skills: '',
  experience: [{ ...emptyJob }], education: [{ ...emptyEdu }],
  certificates: [{ ...emptyCertificate }], projects: [{ ...emptyProject }],
};
const testResume = {
  name: 'Jordan Example',
  email: 'jordan.example@example.com',
  phone: '555-0104',
  location: 'Seattle, WA',
  summary: 'Frontend developer with 4 years of experience building accessible web applications. Skilled in React, JavaScript, and design systems, with a focus on improving usability and performance.',
  skills: 'JavaScript, React, TypeScript, CSS, Accessibility, Git',
  experience: [{
    company: 'Sample Studio',
    role: 'Frontend Developer',
    start: 'Jan 2022',
    end: 'Present',
    bullets: 'Improved page load time by 28% by optimizing reusable React components.\nBuilt accessible interface patterns used across 12 product pages.\nPartnered with design and product teams to deliver 3 major releases.',
  }],
  education: [{ school: 'Example State University', degree: 'B.S. in Computer Science', year: '2021' }],
  certificates: [{
    name: 'Web Accessibility Fundamentals',
    issuer: 'Example Learning',
    issueDate: 'May 2024',
    credentialId: 'DEMO-1234',
    url: '',
  }],
  projects: [{
    name: 'Community Events Dashboard',
    role: 'Personal Project',
    technologies: 'React, TypeScript, CSS',
    url: '',
    description: 'Created a responsive dashboard that helps local organizers manage event registrations.',
  }],
};
const keywordStopWords = new Set([
  'a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'have',
  'in', 'into', 'is', 'it', 'of', 'on', 'or', 'our', 'the', 'their', 'this', 'to',
  'we', 'with', 'you', 'your', 'will', 'years', 'year', 'work', 'working', 'role',
]);

function extractKeywords(text) {
  return [...new Set((text.toLowerCase().match(/[a-z0-9][a-z0-9+#.-]*/g) || [])
    .filter((term) => !keywordStopWords.has(term)))];
}
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
async function api(url, body, method = 'POST') {
  let res;
  try {
    res = await fetch(`${API_BASE}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Cannot reach the backend. Start it with "npm run dev:server" in a separate terminal, then try again.');
    }
    throw error;
  }
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Request failed (${res.status})`);
  }
  return res;
}

const input = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-ink focus:outline-none focus:ring-2 focus:ring-teal-ink/30';
const btn = 'rounded px-4 py-2 text-sm font-medium transition disabled:opacity-50';

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Block({ title, children }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 border-b border-teal-ink pb-1 font-sans text-sm font-semibold text-teal-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function App() {
  const [data, setData] = useState(initial);
  const [id, setId] = useState(localStorage.getItem('resumeId'));
  const [view, setView] = useState('edit'); // edit | preview (small screens)
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [ai, setAi] = useState(null);
  const [jobDescription, setJobDescription] = useState('');

  useEffect(() => {
    if (!id) return;
    api(`/api/resumes/${id}`, null, 'GET')
      .then((r) => r.json()).then((resume) => setData({
        ...initial,
        ...resume,
        experience: resume.experience?.length ? resume.experience : [{ ...emptyJob }],
        education: resume.education?.length ? resume.education : [{ ...emptyEdu }],
        certificates: resume.certificates?.length ? resume.certificates : [{ ...emptyCertificate }],
        projects: resume.projects?.length ? resume.projects : [{ ...emptyProject }],
      })).catch(() => {});
  }, []); // eslint-disable-line

  const set = (k, v) => setData((d) => ({ ...d, [k]: v }));
  const loadTestResume = () => {
    setData({
      ...testResume,
      experience: testResume.experience.map((item) => ({ ...item })),
      education: testResume.education.map((item) => ({ ...item })),
      certificates: testResume.certificates.map((item) => ({ ...item })),
      projects: testResume.projects.map((item) => ({ ...item })),
    });
    setId(null);
    setAi(null);
    setJobDescription('Seeking a frontend developer skilled in React, TypeScript, accessibility, and performance optimization.');
    setMsg('Loaded fictional test resume data. It has not been saved.');
  };
  const setItem = (key, i, k, v) =>
    setData((d) => ({ ...d, [key]: d[key].map((it, n) => (n === i ? { ...it, [k]: v } : it)) }));
  const addItem = (key, blank) => setData((d) => ({ ...d, [key]: [...d[key], { ...blank }] }));
  const removeItem = (key, i) => setData((d) => ({ ...d, [key]: d[key].filter((_, n) => n !== i) }));

  const run = async (name, fn) => {
    setBusy(name); setMsg('');
    try { await fn(); } catch (e) { setMsg(e.message); }
    setBusy('');
  };

  const save = () => run('save', async () => {
    const res = id ? await api(`/api/resumes/${id}`, data, 'PUT') : await api('/api/resumes', data);
    const doc = await res.json();
    setId(doc._id); localStorage.setItem('resumeId', doc._id);
    setMsg('Saved');
  });

  const suggest = () => run('ai', async () => {
    setAi(null);
    const res = await api('/api/ai/suggest', data);
    const review = await res.json();
    if (typeof review.suggestions !== 'string' || !review.suggestions.trim()) {
      throw new Error('The review did not return any suggestions. Please try again.');
    }
    setAi(review);
  });

  const pdf = () => run('pdf', async () => {
    const res = await api('/api/export/pdf', data);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    const fileName = (data.name || 'resume').trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_') || 'resume';
    a.href = url;
    a.download = `${fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg('Your resume PDF has been downloaded.');
    window.alert('Your resume PDF has been downloaded.');
  });

  const skills = data.skills.split(',').map((s) => s.trim()).filter(Boolean);
  const resumeText = [
    data.name, data.email, data.phone, data.location, data.summary, data.skills,
    ...data.experience.flatMap((job) => [job.role, job.company, job.start, job.end, job.bullets]),
    ...data.education.flatMap((education) => [education.degree, education.school, education.year]),
    ...data.certificates.flatMap((certificate) => [certificate.name, certificate.issuer, certificate.credentialId]),
    ...data.projects.flatMap((project) => [project.name, project.role, project.technologies, project.description]),
  ].join(' ');
  const resumeTerms = new Set(extractKeywords(resumeText));
  const jobTerms = extractKeywords(jobDescription);
  const matchedKeywords = jobTerms.filter((term) => resumeTerms.has(term));
  const missingKeywords = jobTerms.filter((term) => !resumeTerms.has(term));
  const atsChecks = [
    { label: 'Name included', complete: Boolean(data.name.trim()), detail: 'Add your full name.' },
    { label: 'Contact information included', complete: Boolean(data.email.trim() || data.phone.trim()), detail: 'Add an email address or phone number.' },
    { label: 'Professional summary has useful detail', complete: data.summary.trim().length >= 40, detail: 'Aim for at least a couple of specific sentences.' },
    { label: 'At least three skills listed', complete: skills.length >= 3, detail: 'Include relevant skills that you can support with experience.' },
    { label: 'Experience includes role, employer, and dates', complete: data.experience.some((job) => job.role.trim() && job.company.trim() && (job.start.trim() || job.end.trim())), detail: 'Add a role, company, and date range for at least one position.' },
    { label: 'Experience includes a measurable result', complete: data.experience.some((job) => /\d/.test(job.bullets)), detail: 'Where accurate, quantify the impact in an achievement.' },
    { label: 'Education included', complete: data.education.some((education) => education.degree.trim() || education.school.trim()), detail: 'Add a degree, school, or relevant qualification.' },
  ];
  const completedChecks = atsChecks.filter((check) => check.complete).length;
  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-6">
      <header className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold text-teal-ink">Resume Builder</h1>
        <div className="flex flex-wrap gap-2">
          <button className={`${btn} border border-slate-300 bg-white lg:hidden`} onClick={() => setView(view === 'edit' ? 'preview' : 'edit')}>
            {view === 'edit' ? 'Preview' : 'Edit'}
          </button>
          <button className={`${btn} border border-slate-300 bg-white`} onClick={save} disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
          <button className={`${btn} border border-slate-300 bg-white`} onClick={() => window.print()}>Print</button>
          <button className={`${btn} bg-teal-ink text-white`} onClick={pdf} disabled={!!busy}>{busy === 'pdf' ? 'Preparing…' : 'Download PDF'}</button>
        </div>
      </header>
      {msg && <p className="no-print mb-3 rounded bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">{msg}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ---------- Editor ---------- */}
        <div className={`no-print space-y-6 ${view === 'preview' ? 'hidden lg:block' : ''}`}>
          <section className="space-y-3 rounded-lg bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Contact</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name"><input className={input} value={data.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="Email"><input className={input} value={data.email} onChange={(e) => set('email', e.target.value)} /></Field>
              <Field label="Phone"><input className={input} value={data.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Location"><input className={input} value={data.location} onChange={(e) => set('location', e.target.value)} /></Field>
            </div>
          </section>

          <section className="space-y-3 rounded-lg bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Summary and skills</h2>
            <Field label="Professional summary"><textarea rows={4} className={input} value={data.summary} onChange={(e) => set('summary', e.target.value)} /></Field>
            <Field label="Skills (comma separated)"><input className={input} value={data.skills} onChange={(e) => set('skills', e.target.value)} placeholder="React, Node.js, SQL" /></Field>
          </section>

          <section className="space-y-4 rounded-lg bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Experience</h2>
            {data.experience.map((j, i) => (
              <div key={i} className="space-y-3 border-t border-slate-200 pt-3 first:border-0 first:pt-0">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Role"><input className={input} value={j.role} onChange={(e) => setItem('experience', i, 'role', e.target.value)} /></Field>
                  <Field label="Company"><input className={input} value={j.company} onChange={(e) => setItem('experience', i, 'company', e.target.value)} /></Field>
                  <Field label="Start"><input className={input} value={j.start} onChange={(e) => setItem('experience', i, 'start', e.target.value)} placeholder="Jan 2022" /></Field>
                  <Field label="End"><input className={input} value={j.end} onChange={(e) => setItem('experience', i, 'end', e.target.value)} placeholder="Present" /></Field>
                </div>
                <Field label="Achievements (one per line)"><textarea rows={4} className={input} value={j.bullets} onChange={(e) => setItem('experience', i, 'bullets', e.target.value)} /></Field>
                {data.experience.length > 1 && <button className="text-sm text-red-600" onClick={() => removeItem('experience', i)}>Remove job</button>}
              </div>
            ))}
            <button className="text-sm font-medium text-teal-ink" onClick={() => addItem('experience', emptyJob)}>Add job</button>
          </section>

          <section className="space-y-4 rounded-lg bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Education</h2>
            {data.education.map((e, i) => (
              <div key={i} className="grid gap-3 border-t border-slate-200 pt-3 first:border-0 first:pt-0 sm:grid-cols-3">
                <Field label="Degree"><input className={input} value={e.degree} onChange={(ev) => setItem('education', i, 'degree', ev.target.value)} /></Field>
                <Field label="School"><input className={input} value={e.school} onChange={(ev) => setItem('education', i, 'school', ev.target.value)} /></Field>
                <Field label="Year"><input className={input} value={e.year} onChange={(ev) => setItem('education', i, 'year', ev.target.value)} /></Field>
                {data.education.length > 1 && <button className="text-left text-sm text-red-600" onClick={() => removeItem('education', i)}>Remove</button>}
              </div>
            ))}
            <button className="text-sm font-medium text-teal-ink" onClick={() => addItem('education', emptyEdu)}>Add education</button>
          </section>

          <section className="space-y-4 rounded-lg bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Projects</h2>
            {data.projects.map((project, i) => (
              <div key={i} className="space-y-3 border-t border-slate-200 pt-3 first:border-0 first:pt-0">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Project name"><input className={input} value={project.name} onChange={(e) => setItem('projects', i, 'name', e.target.value)} /></Field>
                  <Field label="Your role"><input className={input} value={project.role} onChange={(e) => setItem('projects', i, 'role', e.target.value)} /></Field>
                  <Field label="Technologies"><input className={input} value={project.technologies} onChange={(e) => setItem('projects', i, 'technologies', e.target.value)} placeholder="React, Node.js, MongoDB" /></Field>
                  <Field label="Project URL"><input className={input} type="url" value={project.url} onChange={(e) => setItem('projects', i, 'url', e.target.value)} placeholder="https://" /></Field>
                </div>
                <Field label="Description and results"><textarea rows={3} className={input} value={project.description} onChange={(e) => setItem('projects', i, 'description', e.target.value)} placeholder="What you built, how you built it, and the outcome." /></Field>
                {data.projects.length > 1 && <button className="text-sm text-red-600" onClick={() => removeItem('projects', i)}>Remove project</button>}
              </div>
            ))}
            <button className="text-sm font-medium text-teal-ink" onClick={() => addItem('projects', emptyProject)}>Add project</button>
          </section>

          <section className="space-y-4 rounded-lg bg-white p-4 shadow-sm">
            <h2 className="font-semibold">Certifications</h2>
            {data.certificates.map((certificate, i) => (
              <div key={i} className="space-y-3 border-t border-slate-200 pt-3 first:border-0 first:pt-0">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Certificate name"><input className={input} value={certificate.name} onChange={(e) => setItem('certificates', i, 'name', e.target.value)} /></Field>
                  <Field label="Issuing organization"><input className={input} value={certificate.issuer} onChange={(e) => setItem('certificates', i, 'issuer', e.target.value)} /></Field>
                  <Field label="Issue date"><input className={input} value={certificate.issueDate} onChange={(e) => setItem('certificates', i, 'issueDate', e.target.value)} placeholder="May 2025" /></Field>
                  <Field label="Credential ID"><input className={input} value={certificate.credentialId} onChange={(e) => setItem('certificates', i, 'credentialId', e.target.value)} /></Field>
                  <Field label="Credential URL"><input className={input} type="url" value={certificate.url} onChange={(e) => setItem('certificates', i, 'url', e.target.value)} placeholder="https://" /></Field>
                </div>
                {data.certificates.length > 1 && <button className="text-sm text-red-600" onClick={() => removeItem('certificates', i)}>Remove certification</button>}
              </div>
            ))}
            <button className="text-sm font-medium text-teal-ink" onClick={() => addItem('certificates', emptyCertificate)}>Add certification</button>
          </section>

          <section className="space-y-4 rounded-lg bg-white p-4 shadow-sm">
            <div>
              <h2 className="font-semibold">ATS content check</h2>
              <p className="mt-1 text-sm text-slate-500">Practical content checks, not a guarantee of how every hiring system will rank your resume.</p>
            </div>
            <p className="text-sm font-medium text-slate-700">{completedChecks} of {atsChecks.length} checks complete</p>
            <ul className="space-y-2">
              {atsChecks.map((check) => (
                <li key={check.label} className="flex gap-2 text-sm">
                  <span className={check.complete ? 'font-semibold text-green-700' : 'font-semibold text-amber-700'} aria-label={check.complete ? 'Complete' : 'Needs attention'}>
                    {check.complete ? 'OK' : 'Tip'}
                  </span>
                  <span className="text-slate-700">{check.label}{!check.complete && <span className="block text-slate-500">{check.detail}</span>}</span>
                </li>
              ))}
            </ul>
            <Field label="Target job description (optional)">
              <textarea rows={5} className={input} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste a job description to compare its terms with your resume." />
            </Field>
            {jobTerms.length > 0 && (
              <div className="space-y-2 text-sm">
                <p className="text-slate-700">Found {matchedKeywords.length} of {jobTerms.length} distinct terms in your resume.</p>
                {matchedKeywords.length > 0 && <p><span className="font-medium text-green-700">Present:</span> <span className="text-slate-600">{matchedKeywords.slice(0, 12).join(', ')}</span></p>}
                {missingKeywords.length > 0 && <p><span className="font-medium text-amber-700">Not found:</span> <span className="text-slate-600">{missingKeywords.slice(0, 12).join(', ')}</span></p>}
                <p className="text-xs text-slate-500">Use relevant terms only when they truthfully reflect your skills and experience.</p>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-lg border-2 border-teal-ink bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">AI suggestions</h2>
              <div className="flex flex-wrap gap-2">
                <button className={`${btn} border border-slate-300 bg-white`} onClick={loadTestResume} disabled={!!busy}>Load test resume</button>
                <button className={`${btn} bg-teal-ink text-white`} onClick={suggest} disabled={!!busy}>{busy === 'ai' ? 'Reviewing…' : 'Improve my resume'}</button>
              </div>
            </div>
            {!ai && <p className="text-sm text-slate-500">Fill in your details, then get a few simple suggestions to improve your resume.</p>}
            {ai && <p className="text-sm text-slate-500" aria-live="polite">
              {ai.source === 'built-in' ? 'Built-in resume suggestions (add an AI API key for model-generated feedback).' : 'AI-generated suggestions.'}
            </p>}
            {ai?.suggestions && (
              <p className="whitespace-pre-wrap rounded bg-paper p-3 text-sm">{ai.suggestions}</p>
            )}
          </section>
        </div>

        {/* ---------- Preview (print area) ---------- */}
        <div className={`print-area ${view === 'edit' ? 'hidden lg:block' : ''}`}>
          <article className="resume-sheet mx-auto min-h-[60vh] max-w-[800px] bg-white p-8 font-serif shadow-md lg:sticky lg:top-4">
            <h1 className="text-3xl font-bold text-slate-900">{data.name || 'Your Name'}</h1>
            <p className="mt-1 font-sans text-sm text-slate-500">{[data.email, data.phone, data.location].filter(Boolean).join('  |  ')}</p>

            {data.summary && <Block title="Summary"><p className="text-[15px] leading-relaxed">{data.summary}</p></Block>}
            {skills.length > 0 && <Block title="Skills"><p className="text-[15px]">{skills.join('  •  ')}</p></Block>}
            {data.experience.some((j) => j.role || j.company) && (
              <Block title="Experience">
                {data.experience.filter((j) => j.role || j.company).map((j, i) => (
                  <div key={i} className="mb-3">
                    <p className="font-semibold">{j.role}{j.company && ` — ${j.company}`}</p>
                    <p className="font-sans text-xs text-slate-500">{[j.start, j.end].filter(Boolean).join(' – ')}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[15px]">
                      {j.bullets.split('\n').filter((b) => b.trim()).map((b, n) => <li key={n}>{b}</li>)}
                    </ul>
                  </div>
                ))}
              </Block>
            )}
            {data.education.some((e) => e.school || e.degree) && (
              <Block title="Education">
                {data.education.filter((e) => e.school || e.degree).map((e, i) => (
                  <p key={i} className="text-[15px]"><b>{e.degree}</b>{e.school && ` — ${e.school}`}{e.year && <span className="text-slate-500">  ({e.year})</span>}</p>
                ))}
              </Block>
            )}
            {data.projects.some((project) => project.name || project.role || project.description) && (
              <Block title="Projects">
                {data.projects.filter((project) => project.name || project.role || project.description).map((project, i) => (
                  <div key={i} className="mb-3">
                    <p className="font-semibold">{project.name}{project.role && ` — ${project.role}`}</p>
                    {project.technologies && <p className="font-sans text-sm">Technologies: {project.technologies}</p>}
                    {project.url && <p className="font-sans text-sm">{project.url}</p>}
                    {project.description && <p className="mt-1 text-[15px]">{project.description}</p>}
                  </div>
                ))}
              </Block>
            )}
            {data.certificates.some((certificate) => certificate.name || certificate.issuer) && (
              <Block title="Certifications">
                {data.certificates.filter((certificate) => certificate.name || certificate.issuer).map((certificate, i) => (
                  <div key={i} className="mb-2">
                    <p className="font-semibold">{certificate.name}</p>
                    <p className="font-sans text-sm text-slate-600">{[certificate.issuer, certificate.issueDate, certificate.credentialId && `Credential ID: ${certificate.credentialId}`].filter(Boolean).join('  |  ')}</p>
                    {certificate.url && <p className="font-sans text-sm">{certificate.url}</p>}
                  </div>
                ))}
              </Block>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
