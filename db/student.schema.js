// db/student.schema.js
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  scholarId: { type: String, required: true, unique: true }, // Changed to String!
  email: { type: String, default: null },
  userName: { type: String, required: true },
  name: { type: String },
  profileImage: { type: String, default: 'default.png' },
  cgpa: { type: Number, default: 0 },
  sgpa_curr: { type: Number, default: 0 },
  sgpa_prev: { type: Number, default: 0 }
}, {
  timestamps: true,
  collection: 'students'
});

module.exports = mongoose.model('Student', studentSchema);