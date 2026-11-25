import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    name: String, email: String, phone: String, location: String,
    summary: String, skills: String,
    experience: [{ company: String, role: String, start: String, end: String, bullets: String }],
    education: [{ school: String, degree: String, year: String }],
    certificates: [{ name: String, issuer: String, issueDate: String, credentialId: String, url: String }],
    projects: [{ name: String, role: String, technologies: String, url: String, description: String }],
  },
  { timestamps: true }
);

export default mongoose.model('Resume', schema);
