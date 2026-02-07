require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./db/connect");
const Student = require("./db/student.schema");
const Course = require("./db/course.schema");
const Attendance = require("./db/attendance.schema");

const app = express();
app.use(cors());
app.use(express.json());

connectDB();

// Test route to verify routes work
app.get("/test-profile", (req, res) => {
  res.json({ message: "Profile route test works" });
});


/// Add this route to your existing backend
app.get('/api/check-registration/:scholarId', async (req, res) => {
  try {
    const { scholarId } = req.params;
    
    // Check your database if this scholarId exists
    const student = await Student.findOne({ 
      scholarId: scholarId 
    });
    
    // Return true if found, false if not
    res.json({ 
      isRegistered: !!student,
      message: student ? "User is registered" : "User not registered"
    });
    
  } catch (error) {
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

/* ------------------ HEALTH ------------------ */

app.get("/", (req, res) => {
  res.json({ status: "Backend running" });
});

/* ------------------ LOGIN ------------------ */

app.post("/api/login", async (req, res) => {
  try {
    const { scholarId } = req.body;

    const student = await Student.findOne({ scholarId });
    if (!student) {
      return res.status(404).json({ 
        success: false, 
        error: "Student not found" 
      });
    }

    // Make sure all fields are included
    res.json({ 
      success: true, 
      student: {
        scholarId: student.scholarId,
        name: student.name,
        email: student.email,
        userName: student.userName,
        profileImage: student.profileImage,
        cgpa: student.cgpa,
        sgpa_curr: student.sgpa_curr,
        sgpa_prev: student.sgpa_prev
      }
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: "Server error" 
    });
  }
});



/* ------------------ REGISTER ------------------ */

app.post("/api/register", async (req, res) => {
  try {
    const { scholarId, email, userName } = req.body;
    
    console.log("Registration attempt:", { scholarId, email, userName });
    
    // Validate input
    if (!scholarId || !email || !userName) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields" 
      });
    }
    
    // Check if already exists
    const existingStudent = await Student.findOne({ 
      $or: [{ scholarId }, { email }] 
    });
    
    if (existingStudent) {
      // Update existing student (match your schema fields)
      console.log("Student exists, updating...");
      
      existingStudent.email = email;
      existingStudent.userName = userName;
      existingStudent.name = userName; // Also update name field
      
      await existingStudent.save();
      
      return res.json({ 
        success: true, 
        message: "Registration updated successfully",
        student: existingStudent
      });
    }
    
    // Create new student (match your schema fields)
    console.log("Creating new student...");
    
    const newStudent = new Student({
      scholarId,
      email,
      userName,
      name: userName, // Both name and userName
      profileImage: "default.png", // Default from your schema
      cgpa: 0,
      sgpa_curr: 0,
      sgpa_prev: 0
      // createdAt and updatedAt will be added automatically by mongoose
    });
    
    await newStudent.save();
    
    console.log("Student created successfully:", newStudent.scholarId);
    
    res.json({ 
      success: true, 
      message: "Registration successful",
      student: newStudent
    });
    
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ 
      success: false, 
      error: "Registration failed. Please try again." 
    });
  }
});



/* ------------------ PROFILE ------------------ */
app.get("/api/profile/:scholarId", async (req, res) => {
  console.log("📢 PROFILE ROUTE HIT with scholarId:", req.params.scholarId);
  
  try {
    const { scholarId } = req.params;
    console.log("Looking for student:", scholarId);

    const student = await Student.findOne({ scholarId });
    console.log("Student found:", student ? "YES" : "NO");

    if (!student) return res.status(404).json({ error: "Not found" });

    const semester = getCurrentSemesterFromScholarId(scholarId);
    const branchShort = getBranchFromScholarId(scholarId);
    
    console.log("Semester:", semester, "Branch:", branchShort);

    res.json({
      student,
      semester,
      branchShort
    });
  } catch (err) {
    console.error("Profile route error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------ COURSES ------------------ */

app.get("/api/courses/:scholarId", async (req, res) => {
  try {
    const { scholarId } = req.params;

    const semester = getCurrentSemesterFromScholarId(scholarId);
    const branchCode = Number(scholarId.toString()[3]);

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
    res.status(500).json({ error: "Server error" });
  }
});

/* ------------------ ATTENDANCE ------------------ */

app.get("/api/attendance/:scholarId", async (req, res) => {
  try {
    const doc = await Attendance.findOne({
      scholarId: req.params.scholarId
    });

    if (!doc) return res.json({ attendance: [] });
    res.json(doc);
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

    const idx = doc.attendance.findIndex(
      s => s.subjectCode === subjectCode
    );

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

/* ------------------ START ------------------ */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log("Backend running on port", PORT)
);
