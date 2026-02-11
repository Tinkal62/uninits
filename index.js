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

// Helper to handle string/number scholarId
async function findStudentSafe(scholarId) {
  return Student.findOne({
    $or: [
      { scholarId: scholarId },
      { scholarId: Number(scholarId) }
    ]
  });
}

// Semester & Branch Helpers
function getCurrentSemesterFromScholarId(scholarId) {
  if (!scholarId) return null;
  const yearCode = scholarId.toString().slice(0, 2);
  const semesterMap = { "22": 8, "23": 6, "24": 4, "25": 2 };
  return semesterMap[yearCode] || null;
}

function getBranchFromScholarId(scholarId) {
  const code = Number(scholarId.toString()[3]);
  return { 1: "CE", 2: "CSE", 3: "EE", 4: "ECE", 5: "EIE", 6: "ME" }[code];
}

// Health Check
app.get("/", (req, res) => {
  res.json({ status: "Backend running", message: "uniNITS Backend API" });
});





/// ------------------ DEBUG: CHECK DATABASE CONNECTION ------------------
app.get("/api/debug/db", async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    
    const info = {
      connectionState: states[dbState] || 'unknown',
      databaseName: mongoose.connection.db?.databaseName || 'unknown',
      collections: []
    };
    
    if (mongoose.connection.db) {
      const collections = await mongoose.connection.db.listCollections().toArray();
      info.collections = collections.map(c => c.name);
    }
    
    res.json(info);
  } catch (error) {
    console.error("Debug route error:", error);
    res.status(500).json({ error: error.message });
  }
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



// ------------------ LOGIN ROUTE - WITH DUPLICATE HANDLING ------------------
app.post("/api/login", async (req, res) => {
  try {
    const { scholarId } = req.body;
    const numericScholarId = Number(scholarId);
    
    // Find the student with email (registered one)
    let student = await Student.findOne({ 
      scholarId: numericScholarId,
      email: { $exists: true, $ne: null }
    });

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





// ------------------ REGISTER ROUTE - WITH DUPLICATE PREVENTION ------------------
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
    console.log("Current database:", mongoose.connection.db.databaseName);

    // IMPORTANT: Convert scholarId to Number for consistent storage
    const numericScholarId = Number(scholarId);
    
    // FIRST: Delete ANY existing student with this scholarId that has NO email
    // This cleans up the duplicate entries
    const deleteResult = await Student.deleteMany({ 
      scholarId: numericScholarId,
      email: { $exists: false }
    });
    
    if (deleteResult.deletedCount > 0) {
      console.log(`🗑️ Deleted ${deleteResult.deletedCount} incomplete student record(s)`);
    }
    
    // NOW find OR create the student
    let student = await Student.findOne({ scholarId: numericScholarId });

    if (student) {
      console.log("🔄 Updating existing student:", student.scholarId);
      console.log("Before update - email:", student.email, "CGPA:", student.cgpa);
      
      // Preserve GPA values if they exist
      const existingCGPA = student.cgpa;
      const existingSGPA_curr = student.sgpa_curr;
      const existingSGPA_prev = student.sgpa_prev;
      
      student.email = email;
      student.userName = userName;
      student.name = userName;
      
      // Make sure we don't overwrite GPA with 0
      if (existingCGPA > 0) student.cgpa = existingCGPA;
      if (existingSGPA_curr > 0) student.sgpa_curr = existingSGPA_curr;
      if (existingSGPA_prev > 0) student.sgpa_prev = existingSGPA_prev;
      
      await student.save();
      
      console.log("After update - email:", student.email, "CGPA:", student.cgpa);
      
    } else {
      console.log("🆕 Creating new student with scholarId:", numericScholarId);
      
      student = new Student({
        scholarId: numericScholarId,
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

    // Get the final student record
    const savedStudent = await Student.findOne({ scholarId: numericScholarId });
    
    console.log("✅ Registration completed. Final record:", {
      scholarId: savedStudent.scholarId,
      email: savedStudent.email,
      cgpa: savedStudent.cgpa
    });

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







// ------------------ TEST ROUTE - CHECK DATABASE DIRECTLY ------------------
app.get("/api/test/student/:scholarId", async (req, res) => {
  try {
    const { scholarId } = req.params;
    
    // Try all possible matches
    const student = await Student.findOne({
      $or: [
        { scholarId: scholarId },
        { scholarId: Number(scholarId) }
      ]
    });
    
    if (!student) {
      return res.json({ error: "Student not found" });
    }
    
    // Return RAW MongoDB document
    res.json({
      message: "Raw student data from database",
      scholarId: student.scholarId,
      scholarId_type: typeof student.scholarId,
      name: student.name,
      cgpa: student.cgpa,
      cgpa_type: typeof student.cgpa,
      sgpa_curr: student.sgpa_curr,
      sgpa_curr_type: typeof student.sgpa_curr,
      sgpa_prev: student.sgpa_prev,
      sgpa_prev_type: typeof student.sgpa_prev,
      full_document: student
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});





// ------------------ PROFILE ROUTE - STRICT DEBUG VERSION ------------------
app.get("/api/profile/:scholarId", async (req, res) => {
  try {
    const { scholarId } = req.params;
    console.log("========== PROFILE ROUTE DEBUG ==========");
    console.log("1. Looking for scholarId:", scholarId, "Type:", typeof scholarId);
    
    // Try MULTIPLE ways to find the student
    let student = null;
    
    // Method 1: Direct string
    student = await Student.findOne({ scholarId: scholarId });
    if (student) console.log("✅ Found with string match");
    
    // Method 2: Direct number
    if (!student) {
      student = await Student.findOne({ scholarId: Number(scholarId) });
      if (student) console.log("✅ Found with number match");
    }
    
    // Method 3: Using $or
    if (!student) {
      student = await Student.findOne({
        $or: [
          { scholarId: scholarId },
          { scholarId: Number(scholarId) }
        ]
      });
      if (student) console.log("✅ Found with $or");
    }

    if (!student) {
      console.log("❌ Student NOT FOUND in database");
      return res.status(404).json({ error: "Student not found" });
    }

    console.log("2. STUDENT FOUND IN DATABASE:");
    console.log("   - scholarId:", student.scholarId);
    console.log("   - name:", student.name);
    console.log("   - email:", student.email);
    console.log("   - profileImage:", student.profileImage);
    console.log("   - cgpa RAW:", student.cgpa);
    console.log("   - sgpa_curr RAW:", student.sgpa_curr);
    console.log("   - sgpa_prev RAW:", student.sgpa_prev);
    console.log("   - Type of cgpa:", typeof student.cgpa);
    console.log("   - Value of cgpa:", student.cgpa);
    
    // Check if values are actually there
    if (student.cgpa === 0 || student.cgpa === null || student.cgpa === undefined) {
      console.log("⚠️ WARNING: cgpa is 0/null/undefined in database!");
    }
    
    // MANUALLY SET VALUES FOR TESTING - REMOVE AFTER FIXED
    // If database has values but they're not coming through, uncomment these lines:
    /*
    if (scholarId.toString() === "2415062") {
      student.cgpa = 7.58;
      student.sgpa_curr = 8.21;
      student.sgpa_prev = 8.22;
      console.log("🔧 MANUALLY SET TEST VALUES");
    }
    */

    const semester = getCurrentSemesterFromScholarId(scholarId);
    const branchShort = getBranchFromScholarId(scholarId);

    const responseData = {
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
    };

    console.log("3. SENDING TO FRONTEND:", JSON.stringify(responseData, null, 2));
    console.log("==========================================");

    res.json(responseData);
  } catch (err) {
    console.error("❌ Profile route error:", err);
    res.status(500).json({ error: "Server error" });
  }
});




// ------------------ COURSES ROUTE ------------------
app.get("/api/courses/:scholarId", async (req, res) => {
  try {
    const { scholarId } = req.params;
    const semester = getCurrentSemesterFromScholarId(scholarId);
    const branchCode = Number(scholarId.toString()[3]);

    const current = await Course.findOne({ branchCode, semester });
    const all = await Course.find({ branchCode }).sort({ semester: 1 });

    res.json({
      currentSemesterCourses: current?.courses || [],
      allCourses: all
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ------------------ ATTENDANCE ROUTES ------------------
app.get("/api/attendance/:scholarId", async (req, res) => {
  try {
    const { scholarId } = req.params;
    const doc = await Attendance.findOne({ scholarId });
    res.json(doc || { scholarId, attendance: [] });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/attendance/update", async (req, res) => {
  try {
    const { scholarId, subjectCode, total, attended } = req.body;

    let doc = await Attendance.findOne({ scholarId });
    if (!doc) {
      doc = new Attendance({ scholarId, attendance: [] });
    }

    const idx = doc.attendance.findIndex(s => s.subjectCode === subjectCode);
    if (idx === -1) {
      doc.attendance.push({ subjectCode, total, attended });
    } else {
      doc.attendance[idx].total = total;
      doc.attendance[idx].attended = attended;
    }

    await doc.save();
    res.json({ success: true });
  } catch (err) {
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