// config/passport.js
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");
const { uniqueUsername } = require("../utils/username");

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn("Google login is OFF");
}else passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const first = profile.emails && profile.emails[0];
        const verified = first && (first.verified === true || first.verified === "true");
        if (!first || !first.value || !verified) return done(null, false);   // only accept a verified Google email

        const email = first.value.toLowerCase();
        let user = await User.findOne({ email });

        if (user) {
          if (user.disabled) return done(null, false);
          if (["admin", "superadmin"].includes(user.role)) return done(null, false);   // staff sign in only through /auth/staff/login
          if (!user.googleId) {
            // This address may have been registered by someone who does not own it (no email check at
            // sign-up). Linking Google cancels that password and every login issued so far.
            user.googleId = profile.id;
            user.password = undefined;
            user.tokensValidAfter = new Date();
            user.emailVerified = true;            // Google has confirmed this address
            user.emailVerifyToken = undefined;
            user.emailVerifyExpire = undefined;
            await user.save();
          }
          return done(null, user);
        }

        user = await User.create({
          googleId: profile.id,
          fullname: profile.displayName,
          email,
          username: await uniqueUsername(email),
          role: "student", // default role
          emailVerified: true,
        });
        done(null, user);
      } catch (err) {
        done(err, null);
      }
    }
  )
);

// Only needed if using sessions (optional)
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});