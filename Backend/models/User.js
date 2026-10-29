// Your frontend registration form has:
// fullname
// email
// password
// confirm password
// role (student/admin)
// When someone clicks "Register":
// Frontend sends this to backend
// Now backend must:
// Validate data
// Remove confirmPassword (not stored)
// Hash password
// Save user in database

//User.js file defines how the user will be stored in MongoDB.


const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    fullname: { type: String, required: true, trim: true },
    username:{type:String,default:"",unique: true},
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, },
    bio:{type:String, default:""},
    skills:{type:[String],default:[]},
    role: { type: String, enum: ["student", "teacher", "admin", "superadmin"], default: "student" },
    emailVerified: { type: Boolean, default: false },
    emailVerifyToken: String,      // sha256 of the code in the emailed link
    emailVerifyExpire: Date,
    emailVerifySentAt: Date,       // when a verification email was last SENT (for the 1-minute resend limit)
    disabled: { type: Boolean, default: false },   // a disabled account cannot log in or use any route
    password: { type: String, required: function () { return !this.googleId; }, minlength: 8 },  // Only required for manual signup
    googleId: { type: String, unique: true, sparse: true },
    // pilot study group; leave empty and the backend assigns it from the user id
    group: { type: String, enum: ["adaptive", "control"] },
    consentAt: { type: Date },     // when the student agreed that a teacher can see their progress (set when joining a class)
    // Teachers who sign up themselves wait for an admin. Older teacher accounts have no value here and count as approved.
    teacherApproved: { type: Boolean },
    // result of the common 10-question placement test (see services/placementService.js)
    placement: {
        done: { type: Boolean, default: false },
        completedAt: Date,
        sessionId: String,
        ability: Number,
        se: Number,                       // how unsure the estimate is (smaller = surer)
        level: Number,                    // 1 to 10
        band: String,                     // Beginner | Developing | Proficient | Advanced
        confidence: String,               // low | medium | high
        correct: Number,
        total: Number,
        testVersion: Number,
        subjects: [{ subject: String, ability: Number, level: Number, band: String, answered: Number }],
    },
    tokensValidAfter: { type: Date },   // logins issued before this moment are no longer accepted
    lastLoginAt: { type: Date },        // set on every email/password login (shown to super admins)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },   // set when a super admin creates a staff account
    //enum is used so that only two values are used ...suppose someone tries to access the db and changes the role to hacker the db will reject it ..basic form of protection ...backend security
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    streak: {
        current: { type: Number, default: 0 },
        longest: { type: Number, default: 0 },
        lastActiveDate: { type: Date }
    },
    activityDates: [
        {
            date: { type: Date },
            count: { type: Number, default: 1 }
        }
    ],
}, { timestamps: true }
);

userSchema.index({ createdAt: -1 });   // "new users in the last 7 / 30 days"
userSchema.index({ role: 1 });         // counts and lists by role

module.exports = mongoose.model("User", userSchema);// Model Constructor Function. is mongoose.model()
// Creates a model named "User"
// Automatically creates a collection named "users" (lowercase + plural)
// Connects schema to that collection