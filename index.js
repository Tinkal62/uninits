require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require('mongoose');

const connectDB = require("./db/connect");
const Student = require("./db/student.schema");
const Course = require("./db/course.schema");
const Attendance = require("./db/attendance.schema");

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

connectDB();



// Helper to handle ALL scholarId formats (numbers AND alphanumeric)
async function findStudentSafe(scholarId) {
  // Convert input to string for consistent comparison
  const searchId = scholarId.toString().trim();
  
  // Try exact string match first
  let student = await Student.findOne({ scholarId: searchId });
  if (student) return student;
  
  // Try as number (if it's numeric)
  if (!isNaN(searchId) && searchId.trim() !== '') {
    const numId = Number(searchId);
    student = await Student.findOne({ scholarId: numId });
    if (student) return student;
  }
  
  // Try with $or for maximum flexibility
  return Student.findOne({
    $or: [
      { scholarId: searchId },
      { scholarId: { $regex: new RegExp(`^${searchId}$`, 'i') } } // Case-insensitive match
    ]
  });
}






// Semester & Branch Helpers - UPDATED for alphanumeric IDs
function getCurrentSemesterFromScholarId(scholarId) {
  if (!scholarId) return null;
  
  const idStr = scholarId.toString();
  
  // Try to extract year code from different formats
  let yearCode = null;
  
  // Format 1: "25EC10001" -> first 2 digits "25"
  if (idStr.match(/^\d{2}/)) {
    yearCode = idStr.substring(0, 2);
  }
  // Format 2: "2415062" -> first 2 digits "24"
  else if (idStr.match(/^\d+$/)) {
    yearCode = idStr.substring(0, 2);
  }
  
  if (yearCode) {
    const semesterMap = { "22": 8, "23": 6, "24": 4, "25": 2 };
    return semesterMap[yearCode] || null;
  }
  
  return null;
}

function getBranchFromScholarId(scholarId) {
  if (!scholarId) return null;
  
  const idStr = scholarId.toString();
  
  // Format 1: "25EC10001" -> extract branch code from position 2-3? "EC"
  if (idStr.length >= 4) {
    const branchPart = idStr.substring(2, 4); // Get "EC" from "25EC10001"
    
    const branchMap = {
      "CE": "CE", "CS": "CSE", "EE": "EE", "EC": "ECE", "EI": "EIE", "ME": "ME"
    };
    
    if (branchMap[branchPart]) {
      return branchMap[branchPart];
    }
  }
  
  // Format 2: "2415062" -> get 4th character as number
  const code = Number(idStr[3]);
  const numericBranchMap = {
    1: "CE", 2: "CSE", 3: "EE", 4: "ECE", 5: "EIE", 6: "ME"
  };
  
  if (!isNaN(code) && numericBranchMap[code]) {
    return numericBranchMap[code];
  }
  
  return null;
}





function getBranchFromScholarId(scholarId) {
  const code = Number(scholarId.toString()[3]);
  return { 1: "CE", 2: "CSE", 3: "EE", 4: "ECE", 5: "EIE", 6: "ME" }[code];
}

// Health Check
app.get("/", (req, res) => {
  res.json({ status: "Backend running", message: "uniNITS Backend API" });
});



// ------------------ CHECK REGISTRATION ROUTE ------------------
app.get('/api/check-registration/:scholarId', async (req, res) => {
  try {
    const { scholarId } = req.params;
    console.log("🔍 Checking registration for:", scholarId);
    
    const student = await findStudentSafe(scholarId);
    
    if (!student) {
      return res.json({ 
        isRegistered: false,
        message: "Student not found in database"
      });
    }
    
    const hasEmail = !!student.email;
    
    res.json({ 
      isRegistered: hasEmail,
      message: hasEmail ? "User is registered" : "User found but not fully registered",
      hasEmail: hasEmail
    });
    
  } catch (error) {
    console.error("❌ Error checking registration:", error);
    res.status(500).json({ 
      isRegistered: false, 
      error: "Server error checking registration" 
    });
  }
});



// ------------------ LOGIN ROUTE - HANDLES BOTH FORMATS ------------------
app.post("/api/login", async (req, res) => {
  try {
    const { scholarId } = req.body;
    const searchId = scholarId.toString().trim();
    
    // Find student with email (registered) - try string first
    let student = await Student.findOne({ 
      scholarId: searchId,
      email: { $exists: true, $ne: null }
    });

    // If not found and it's numeric, try as number
    if (!student && !isNaN(searchId)) {
      student = await Student.findOne({ 
        scholarId: Number(searchId),
        email: { $exists: true, $ne: null }
      });
    }

    if (!student) {
      return res.status(404).json({ 
        success: false, 
        error: "Student not found. Please register first." 
      });
    }

    res.json({
      success: true,
      student: {
        scholarId: student.scholarId,
        name: student.name || student.userName,
        email: student.email,
        userName: student.userName,
        profileImage: student.profileImage || "default.png",
        cgpa: student.cgpa || 0,
        sgpa_curr: student.sgpa_curr || 0,
        sgpa_prev: student.sgpa_prev || 0
      }
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ success: false, error: "Server error during login" });
  }
});





// ------------------ REGISTER ROUTE - HANDLES BOTH FORMATS ------------------
app.post("/api/register", async (req, res) => {
  try {
    const { scholarId, email, userName } = req.body;

    if (!scholarId || !email || !userName) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    if (!email.includes('@') || !email.includes('nits.ac.in')) {
      return res.status(400).json({ success: false, error: "Please use a valid NIT Silchar email address" });
    }

    console.log("📝 Registration attempt for:", { scholarId, email, userName });
    
    // PRESERVE original format - DON'T convert to Number!
    const originalScholarId = scholarId.toString().trim();
    
    // Delete incomplete records with SAME STRING ID
    const deleteResult = await Student.deleteMany({ 
      scholarId: originalScholarId,
      email: { $exists: false }
    });
    
    if (deleteResult.deletedCount > 0) {
      console.log(`🗑️ Deleted ${deleteResult.deletedCount} incomplete record(s)`);
    }
    
    // Find existing student with this ID (as string)
    let student = await Student.findOne({ scholarId: originalScholarId });

    if (student) {
      console.log("🔄 Updating existing student:", student.scholarId);
      
      // Preserve existing values
      const existingCGPA = student.cgpa;
      const existingSGPA_curr = student.sgpa_curr;
      const existingSGPA_prev = student.sgpa_prev;
      
      student.email = email;
      student.userName = userName;
      student.name = userName;
      
      if (existingCGPA > 0) student.cgpa = existingCGPA;
      if (existingSGPA_curr > 0) student.sgpa_curr = existingSGPA_curr;
      if (existingSGPA_prev > 0) student.sgpa_prev = existingSGPA_prev;
      
      await student.save();
      
    } else {
      console.log("🆕 Creating new student with ID:", originalScholarId);
      
      student = new Student({
        scholarId: originalScholarId, // Store as STRING
        email,
        userName,
        name: userName,
        profileImage: "default.png",
        cgpa: 0,
        sgpa_curr: 0,
        sgpa_prev: 0
      });
      
      await student.save();
    }

    const savedStudent = await Student.findOne({ scholarId: originalScholarId });
    
    res.json({
      success: true,
      message: "Registration successful",
      student: {
        scholarId: savedStudent.scholarId,
        name: savedStudent.name,
        email: savedStudent.email,
        userName: savedStudent.userName,
        profileImage: savedStudent.profileImage || "default.png",
        cgpa: savedStudent.cgpa || 0,
        sgpa_curr: savedStudent.sgpa_curr || 0,
        sgpa_prev: savedStudent.sgpa_prev || 0
      }
    });
    
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({ success: false, error: "Registration failed. Please try again." });
  }
});

// ------------------ PROFILE ROUTE - HANDLES BOTH FORMATS ------------------
app.get("/api/profile/:scholarId", async (req, res) => {
  try {
    const { scholarId } = req.params;
    const searchId = scholarId.toString().trim();
    
    console.log("🔍 Looking for scholarId:", searchId);
    
    // Try multiple matching strategies
    let student = await Student.findOne({ scholarId: searchId });
    
    if (!student && !isNaN(searchId)) {
      student = await Student.findOne({ scholarId: Number(searchId) });
    }
    
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const semester = getCurrentSemesterFromScholarId(student.scholarId);
    const branchShort = getBranchFromScholarId(student.scholarId);

    res.json({
      student: {
        scholarId: student.scholarId,
        name: student.name || student.userName,
        email: student.email,
        userName: student.userName,
        profileImage: student.profileImage || "default.png",
        cgpa: student.cgpa,
        sgpa_curr: student.sgpa_curr,
        sgpa_prev: student.sgpa_prev
      },
      semester,
      branchShort
    });
  } catch (err) {
    console.error("❌ Profile route error:", err);
    res.status(500).json({ error: "Server error" });
  }
});




// ------------------ COURSES ROUTE - UPDATED for alphanumeric IDs ------------------
app.get("/api/courses/:scholarId", async (req, res) => {
  try {
    const { scholarId } = req.params;
    const idStr = scholarId.toString();
    
    console.log("📚 Courses request for:", idStr);
    
    // Get semester using updated helper
    const semester = getCurrentSemesterFromScholarId(idStr);
    
    // Get branch code in format that matches your Course schema
    let branchCode = null;
    
    // For alphanumeric IDs like "25EC10001"
    if (idStr.length >= 4) {
      const branchPart = idStr.substring(2, 4); // "EC"
      const branchToCode = {
        "CE": 1, "CS": 2, "EE": 3, "EC": 4, "EI": 5, "ME": 6
      };
      branchCode = branchToCode[branchPart];
    }
    
    // For numeric IDs like "2415062"
    if (branchCode === null) {
      branchCode = Number(idStr[3]);
    }
    
    console.log("Extracted - Semester:", semester, "BranchCode:", branchCode);
    
    if (!semester || !branchCode) {
      return res.json({
        currentSemesterCourses: [],
        allCourses: [],
        error: "Could not determine semester or branch from scholarId"
      });
    }

    const current = await Course.findOne({ branchCode, semester });
    const all = await Course.find({ branchCode }).sort({ semester: 1 });

    console.log(`Found ${current?.courses?.length || 0} current courses`);
    
    res.json({
      currentSemesterCourses: current?.courses || [],
      allCourses: all || []
    });
  } catch (err) {
    console.error("❌ Courses route error:", err);
    res.status(500).json({ error: "Server error", details: err.message });
  }
});






// ------------------ ATTENDANCE ROUTES - UPDATED ------------------
app.get("/api/attendance/:scholarId", async (req, res) => {
  try {
    const { scholarId } = req.params;
    const searchId = scholarId.toString().trim();
    
    console.log("📊 Attendance request for:", searchId);
    
    // Try to find attendance with string ID first
    let doc = await Attendance.findOne({ scholarId: searchId });
    
    // If not found and it's numeric, try as number
    if (!doc && !isNaN(searchId)) {
      doc = await Attendance.findOne({ scholarId: Number(searchId) });
    }
    
    res.json(doc || { scholarId: searchId, attendance: [] });
  } catch (err) {
    console.error("❌ Attendance get error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/attendance/update", async (req, res) => {
  try {
    const { scholarId, subjectCode, total, attended } = req.body;
    const searchId = scholarId.toString().trim();
    
    console.log("📝 Attendance update for:", searchId, subjectCode);

    // Try to find existing attendance record
    let doc = await Attendance.findOne({ scholarId: searchId });
    
    // If not found and it's numeric, try as number
    if (!doc && !isNaN(searchId)) {
      doc = await Attendance.findOne({ scholarId: Number(searchId) });
    }
    
    if (!doc) {
      doc = new Attendance({ scholarId: searchId, attendance: [] });
    }

    const idx = doc.attendance.findIndex(s => s.subjectCode === subjectCode);
    if (idx === -1) {
      doc.attendance.push({ subjectCode, total, attended });
    } else {
      doc.attendance[idx].total = total;
      doc.attendance[idx].attended = attended;
    }

    await doc.save();
    console.log("✅ Attendance saved successfully");
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Attendance update error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});








// ------------------ PROFILE PICTURE UPLOAD ------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads/profile-images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const scholarId = req.body.scholarId;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `${scholarId}-${timestamp}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image!'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.post('/api/profile/upload-photo', upload.single('profileImage'), async (req, res) => {
  try {
    const { scholarId } = req.body;

    if (!scholarId || !req.file) {
      return res.status(400).json({ error: 'Scholar ID and image file are required' });
    }

    const student = await findStudentSafe(scholarId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (student.profileImage && student.profileImage !== 'default.png') {
      const oldImagePath = path.join(__dirname, 'uploads/profile-images', student.profileImage);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    student.profileImage = req.file.filename;
    await student.save();

    res.json({
      success: true,
      filename: req.file.filename,
      url: `/uploads/profile-images/${req.file.filename}`
    });
  } catch (error) {
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ success: false, error: 'Failed to upload profile picture' });
  }
});

app.use('/assets/images', express.static(path.join(__dirname, 'assets/images')));

// ------------------ START SERVER ------------------
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));