db.courses.bulkWrite([
  // ================= SEMESTER 4 =================
  {
    updateOne: {
      filter: { branchShort: "ECE", semester: 4 },
      update: {
        $set: {
          branchCode: 4,
          branchShort: "ECE",
          semester: 4,
          courses: [
            { code: "EC-204", name: "Digital Electronic Circuits", credits: 3 },
            { code: "EC-205", name: "Analog Communication", credits: 4 },
            { code: "EC-206", name: "Control Systems", credits: 4 },
            { code: "EC-207", name: "Probability and Random Process", credits: 4 },
            { code: "EC-208", name: "Electrical & Electronic Materials", credits: 3 },
            { code: "EC-209", name: "Electromagnetic Fields & Wave Propagation", credits: 4 },
            { code: "EC-212", name: "Digital Electronics Laboratory", credits: 2 },
            { code: "EC-213", name: "Control Laboratory", credits: 2 },
            { code: "EC-214", name: "Analog Communication Laboratory", credits: 2 }
          ]
        }
      },
      upsert: true
    }
  },

  // ================= SEMESTER 5 =================
  {
    updateOne: {
      filter: { branchShort: "ECE", semester: 5 },
      update: {
        $set: {
          branchCode: 4,
          branchShort: "ECE",
          semester: 5,
          courses: [
            { code: "EC-301", name: "Digital Communication", credits: 4 },
            { code: "EC-302", name: "Microprocessors & Microcontrollers", credits: 3 },
            { code: "EC-303", name: "Analog Integrated Circuits & Technology", credits: 4 },
            { code: "EC-304", name: "Digital Signal Processing", credits: 4 },
            { code: "EC-305", name: "Electronic Measurements and Instrumentation", credits: 3 },
            { code: "EC-306", name: "Principles of Opto-Electronics and Fibre optics", credits: 3 },
            { code: "EC-311", name: "Microprocessor Laboratory", credits: 2 },
            { code: "EC-312", name: "Digital Signal Processing Laboratory", credits: 2 },
            { code: "EC-313", name: "Digital Communication Laboratory", credits: 2 }
          ]
        }
      },
      upsert: true
    }
  },

  // ================= SEMESTER 6 =================
  {
    updateOne: {
      filter: { branchShort: "ECE", semester: 6 },
      update: {
        $set: {
          branchCode: 4,
          branchShort: "ECE",
          semester: 6,
          courses: [
            { code: "EC-307", name: "RF and Microwave Engineering", credits: 4 },
            { code: "EC-308", name: "Data Communication and Network", credits: 4 },
            { code: "EC-309", name: "VLSI Design", credits: 4 },
            { code: "EC-310", name: "Power Electronics", credits: 4 },
            { code: "EC-33X", name: "Professional Core Elective I", credits: 3 },
            { code: "EC-38X", name: "Open Elective I", credits: 3 },
            { code: "EC-314", name: "Design Laboratory", credits: 2 },
            { code: "EC-315", name: "Data & Optical Communication Laboratory", credits: 2 },
            { code: "EC-316", name: "VLSI Design Laboratory", credits: 2 }
          ]
        }
      },
      upsert: true
    }
  },

  // ================= SEMESTER 7 =================
  {
    updateOne: {
      filter: { branchShort: "ECE", semester: 7 },
      update: {
        $set: {
          branchCode: 4,
          branchShort: "ECE",
          semester: 7,
          courses: [
            { code: "EC-401", name: "Wireless Communication", credits: 3 },
            { code: "EC-43X", name: "Professional Core Elective II", credits: 3 },
            { code: "EC-48X", name: "Open Elective II", credits: 3 },
            { code: "MS-401", name: "Business Management", credits: 3 },
            { code: "EC-498", name: "Project I", credits: 6 }
          ]
        }
      },
      upsert: true
    }
  },

  // ================= SEMESTER 8 =================
  {
    updateOne: {
      filter: { branchShort: "ECE", semester: 8 },
      update: {
        $set: {
          branchCode: 4,
          branchShort: "ECE",
          semester: 8,
          courses: [
            { code: "HS-401", name: "Managerial Economics", credits: 3 },
            { code: "EC-45X", name: "Professional Core Elective III", credits: 3 },
            { code: "EC-49X", name: "Open Elective III", credits: 3 },
            { code: "EC-499", name: "Project II", credits: 6 }
          ]
        }
      },
      upsert: true
    }
  }
]);
