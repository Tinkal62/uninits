require("dotenv").config();

const express = require("express");
const cors = require("cors");

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

// Test route to verify routes work
app.get("/test-profile", (req, res) => {
  res.json({ message: "Profile route test works" });
});

/* ------------------ DEBUG ROUTE ------------------ */
app.get("/api/debug/check/:scholarId", async (req, res) => {
  try {
    const { scholarId } = req.params;
    console.log("🔍 Debug check for scholarId:", scholarId);
    
    const student = await Student.findOne({ scholarId });
    console.log("Student found:", student ? "YES" : "NO");
    console.log("Student email:", student?.email);
    
    const isFullyRegistered = !!(student && student.email);
    
    res.json({ 
      scholarId,
      studentExists: !!student,
      hasEmail: !!student?.email,
      isFullyRegistered,
      studentData: student
    });
  } catch (error) {
    console.error("❌ Debug route error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ------------------ CHECK STUDENT DATA DEBUG ROUTE ------------------ */
app.get("/api/debug/student/:scholarId", async (req, res) => {
  try {
    const { scholarId } = req.params;
    console.log("🔍 DEBUG: Checking full student data for:", scholarId);
    
    const student = await Student.findOne({ scholarId });
    
    if (!student) {
      return res.json({ 
        exists: false,
        message: "Student not found" 
      });
    }
    
    // Convert to plain object to see all fields
    const studentData = student.toObject();
    
    console.log("📊 Full student data:", JSON.stringify(studentData, null, 2));
    
    res.json({
      exists: true,
      rawData: studentData,
      profileImage: studentData.profileImage,
      cgpa: studentData.cgpa,
      sgpa_curr: studentData.sgpa_curr,
      sgpa_prev: studentData.sgpa_prev
    });
    
  } catch (error) {
    console.error("❌ Debug error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ------------------ CHECK REGISTRATION ROUTE ------------------ */
app.get('/api/check-registration/:scholarId', async (req, res) => {
  try {
    const { scholarId } = req.params;
    console.log("🔍 Checking registration for:", scholarId);
    
    // Check if this scholarId exists
    const student = await Student.findOne({ scholarId });
    console.log("Student found:", student ? "YES" : "NO");
    
    if (!student) {
      console.log("❌ Student not found at all");
      return res.json({ 
        isRegistered: false,
        message: "Student not found in database"
      });
    }
    
    // Check if student has email (is fully registered)
    const hasEmail = !!student.email;
    console.log("📧 Student has email:", hasEmail, "Email:", student.email);
    
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

/* ------------------ HELPERS ------------------ */
function getCurrentSemesterFromScholarId(scholarId) {
  if (!scholarId) return null;

  const yearCode = scholarId.toString().slice(0, 2);
  const semesterMap = {
    "22": 8,
    "23": 6,
    "24": 4,
    "25": 2
  };
  return semesterMap[yearCode] || null;
}

function getBranchFromScholarId(scholarId) {
  const code = Number(scholarId.toString()[3]);
  return {
    1: "CE",
    2: "CSE",
    3: "EE",
    4: "ECE",
    5: "EIE",
    6: "ME"
  }[code];
}

/* ------------------ HEALTH CHECK ------------------ */
app.get("/", (req, res) => {
  res.json({ 
    status: "Backend running",
    message: "uniNITS Backend API",
    version: "1.0.0"
  });
});

/* ------------------ LOGIN ROUTE ------------------ */
app.post("/api/login", async (req, res) => {
  try {
    const { scholarId } = req.body;
    console.log("🔐 Login attempt for scholarId:", scholarId);

    const student = await Student.findOne({ scholarId });
    
    // Student not found at all
    if (!student) {
      console.log("❌ Student not found");
      return res.status(404).json({ 
        success: false, 
        error: "Student not found. Please register first." 
      });
    }
    
    console.log("📋 Student found:", student.scholarId);
    console.log("📧 Student email:", student.email);
    
    // Student found but doesn't have email (not fully registered)
    if (!student.email) {
      console.log("⚠️ Student found but no email - not fully registered");
      return res.status(403).json({ 
        success: false, 
        error: "Registration incomplete. Please complete registration first.",
        requiresRegistration: true
      });
    }

    console.log("✅ Login successful for:", student.scholarId);
    
    // Student is fully registered with email
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
    console.error("🔥 Login error:", err);
    res.status(500).json({ 
      success: false, 
      error: "Server error during login" 
    });
  }
});

/* ------------------ REGISTER ROUTE ------------------ */
app.post("/api/register", async (req, res) => {
  try {
    const { scholarId, email, userName } = req.body;
    
    console.log("📝 Registration attempt:", { scholarId, email, userName });
    
    // Validate input
    if (!scholarId || !email || !userName) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields" 
      });
    }
    
    // Validate email format (NIT Silchar format)
    if (!email.includes('@') || !email.includes('nits.ac.in')) {
      return res.status(400).json({ 
        success: false, 
        error: "Please use a valid NIT Silchar email address" 
      });
    }
    
    // Check if student exists (with or without email)
    let student = await Student.findOne({ scholarId });
    
    if (student) {
      // Update existing student - set email and userName
      console.log("🔄 Student exists, completing registration...");
      
      student.email = email;
      student.userName = userName;
      student.name = userName; // Also update name field
      
      await student.save();
      
      console.log("✅ Registration completed for existing student:", student.scholarId);
      
      return res.json({ 
        success: true, 
        message: "Registration completed successfully",
        student: {
          scholarId: student.scholarId,
          name: student.name,
          email: student.email,
          userName: student.userName,
          profileImage: student.profileImage || "default.png",
          cgpa: student.cgpa || 0,
          sgpa_curr: student.sgpa_curr || 0,
          sgpa_prev: student.sgpa_prev || 0
        }
      });
    }
    
    // Create new student
    console.log("🆕 Creating new student...");
    
    const newStudent = new Student({
      scholarId,
      email,
      userName,
      name: userName,
      profileImage: "default.png",
      cgpa: 0,
      sgpa_curr: 0,
      sgpa_prev: 0
    });
    
    await newStudent.save();
    
    console.log("✅ New student created successfully:", newStudent.scholarId);
    
    res.json({ 
      success: true, 
      message: "Registration successful",
      student: {
        scholarId: newStudent.scholarId,
        name: newStudent.name,
        email: newStudent.email,
        userName: newStudent.userName,
        profileImage: newStudent.profileImage || "default.png",
        cgpa: newStudent.cgpa || 0,
        sgpa_curr: newStudent.sgpa_curr || 0,
        sgpa_prev: newStudent.sgpa_prev || 0
      }
    });
    
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({ 
      success: false, 
      error: "Registration failed. Please try again." 
    });
  }
});

/* ------------------ PROFILE ROUTE (FIXED) ------------------ */
app.get("/api/profile/:scholarId", async (req, res) => {
  console.log("📢 PROFILE ROUTE HIT with scholarId:", req.params.scholarId);
  
  try {
    const { scholarId } = req.params;
    console.log("Looking for student:", scholarId);

    const student = await Student.findOne({ scholarId });
    console.log("Student found:", student ? "YES" : "NO");

    if (!student) return res.status(404).json({ error: "Student not found" });

    const semester = getCurrentSemesterFromScholarId(scholarId);
    const branchShort = getBranchFromScholarId(scholarId);
    
    console.log("Semester:", semester, "Branch:", branchShort);
    console.log("Student GPA data (raw):", {
      cgpa: student.cgpa,
      sgpa_curr: student.sgpa_curr,
      sgpa_prev: student.sgpa_prev
    });

    // FIX: Handle "undefined" filename properly
    let profileImage = student.profileImage;
    if (profileImage && (profileImage === "undefined" || profileImage.startsWith("undefined-"))) {
      console.log("⚠️ Fixing undefined profile image for:", scholarId);
      profileImage = "default.png";
      
      // Optionally update the database
      await Student.updateOne(
        { scholarId },
        { $set: { profileImage: "default.png" } }
      );
    }

    // FIX: Don't use || 0 for GPA values as 0 is a valid value
    res.json({
      student: {
        scholarId: student.scholarId,
        name: student.name || student.userName,
        email: student.email,
        userName: student.userName,
        profileImage: profileImage || "default.png",  // Fixed profile image
        cgpa: student.cgpa,  // Removed || 0 to preserve actual 0 values
        sgpa_curr: student.sgpa_curr,  // Removed || 0
        sgpa_prev: student.sgpa_prev  // Removed || 0
      },
      semester,
      branchShort
    });
  } catch (err) {
    console.error("❌ Profile route error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------ COURSES ROUTE ------------------ */
app.get("/api/courses/:scholarId", async (req, res) => {
  try {
    const { scholarId } = req.params;
    console.log("📚 Courses request for:", scholarId);

    const semester = getCurrentSemesterFromScholarId(scholarId);
    const branchCode = Number(scholarId.toString()[3]);

    console.log("Semester:", semester, "Branch code:", branchCode);

    const current = await Course.findOne({
      branchCode,
      semester
    });

    const all = await Course.find({ branchCode }).sort({ semester: 1 });

    res.json({
      currentSemesterCourses: current?.courses || [],
      allCourses: all
    });
  } catch (err) {
    console.error("❌ Courses route error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------ ATTENDANCE ROUTES ------------------ */
app.get("/api/attendance/:scholarId", async (req, res) => {
  try {
    const { scholarId } = req.params;
    console.log("📊 Attendance request for:", scholarId);
    
    const doc = await Attendance.findOne({ scholarId });

    if (!doc) {
      console.log("No attendance record found, returning empty array");
      return res.json({ 
        scholarId,
        attendance: [] 
      });
    }
    
    res.json(doc);
  } catch (err) {
    console.error("❌ Attendance get error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/attendance/update", async (req, res) => {
  try {
    const { scholarId, subjectCode, total, attended } = req.body;
    console.log("📝 Attendance update for:", scholarId, subjectCode);

    let doc = await Attendance.findOne({ scholarId });
    if (!doc) {
      doc = new Attendance({ scholarId, attendance: [] });
      console.log("Created new attendance record");
    }

    const idx = doc.attendance.findIndex(
      s => s.subjectCode === subjectCode
    );

    if (idx === -1) {
      doc.attendance.push({ subjectCode, total, attended });
      console.log("Added new subject:", subjectCode);
    } else {
      doc.attendance[idx].total = total;
      doc.attendance[idx].attended = attended;
      console.log("Updated existing subject:", subjectCode);
    }

    await doc.save();
    console.log("✅ Attendance saved successfully");
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Attendance update error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

/* ------------------ PROFILE PICTURE UPLOAD ------------------ */

// Configure storage for profile pictures
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create uploads directory if it doesn't exist
    const uploadDir = path.join(__dirname, 'uploads/profile-images');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: scholarId-timestamp.extension
    const scholarId = req.body.scholarId;
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    
    // FIX: Validate scholarId before using it
    if (!scholarId || scholarId === 'undefined') {
      console.error("❌ Invalid scholarId during file upload:", scholarId);
      return cb(new Error('Invalid scholarId'), false);
    }
    
    const filename = `${scholarId}-${timestamp}${ext}`;
    console.log("📁 Saving file as:", filename);
    cb(null, filename);
  }
});

// File filter to accept only images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Not an image! Please upload only images.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Profile picture upload route (IMPROVED)
app.post('/api/profile/upload-photo', upload.single('profileImage'), async (req, res) => {
  try {
    console.log("📸 Profile picture upload request received");
    console.log("Request body:", req.body);
    
    const { scholarId } = req.body;
    
    if (!scholarId || scholarId === 'undefined') {
      console.error("❌ Invalid scholarId:", scholarId);
      return res.status(400).json({ 
        success: false, 
        error: 'Valid Scholar ID is required' 
      });
    }
    
    if (!req.file) {
      console.error("❌ No file uploaded");
      return res.status(400).json({ 
        success: false, 
        error: 'No image file uploaded' 
      });
    }
    
    console.log('📸 Profile picture upload for scholarId:', scholarId);
    console.log('✅ File saved as:', req.file.filename);
    
    // Update student record in database with new profile picture filename
    const student = await Student.findOne({ scholarId });
    if (!student) {
      console.error("❌ Student not found in database:", scholarId);
      // Clean up uploaded file
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ 
        success: false,
        error: 'Student not found' 
      });
    }
    
    // Delete old profile picture if it exists and is not default
    if (student.profileImage && student.profileImage !== 'default.png') {
      const oldImagePath = path.join(__dirname, 'uploads/profile-images', student.profileImage);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
        console.log('🗑️ Deleted old profile picture:', student.profileImage);
      }
    }
    
    // Update student record
    student.profileImage = req.file.filename;
    await student.save();
    
    console.log('✅ Profile picture updated in database for:', scholarId);
    
    res.json({
      success: true,
      message: 'Profile picture uploaded successfully',
      filename: req.file.filename,
      url: `/uploads/profile-images/${req.file.filename}`
    });
    
  } catch (error) {
    console.error('❌ Profile picture upload error:', error);
    
    // Delete uploaded file if there was an error
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
        console.log('🗑️ Cleaned up uploaded file due to error');
      } catch (cleanupError) {
        console.error('Error cleaning up file:', cleanupError);
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload profile picture' 
    });
  }
});

// Serve default images from assets
app.use('/assets/images', express.static(path.join(__dirname, 'assets/images')));

/* ------------------ FIX UNDEFINED PROFILE IMAGES ROUTE ------------------ */
app.post('/api/fix-profile-images', async (req, res) => {
  try {
    console.log("🔧 Fixing undefined profile images...");
    
    const result = await Student.updateMany(
      { 
        $or: [
          { profileImage: { $regex: /^undefined/ } },
          { profileImage: "undefined" }
        ]
      },
      { $set: { profileImage: "default.png" } }
    );
    
    console.log(`✅ Fixed ${result.modifiedCount} profile images`);
    
    res.json({
      success: true,
      message: `Fixed ${result.modifiedCount} profile images`,
      modifiedCount: result.modifiedCount
    });
    
  } catch (error) {
    console.error('❌ Error fixing profile images:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fix profile images' 
    });
  }
});

/* ------------------ START SERVER ------------------ */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`🚀 Backend running on port ${PORT}`)
);