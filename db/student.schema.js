const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  scholarId: { type: Number, required: true, unique: true },
  email: { type: String, default: null },
  userName: { type: String, required: true },
  name: { type: String },
  profileImage: { type: String, default: 'default.png' },
  cgpa: { type: Number, default: 0 },
  sgpa_curr: { type: Number, default: 0 },
  sgpa_prev: { type: Number, default: 0 }
}, {
  timestamps: true
});

module.exports = mongoose.model('Student', studentSchema);