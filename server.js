// =================================================================
// Fichier : server.js
// Description : Version finale avec authentification par email/mdp ET par Twitch.
// =================================================================

// --- Imports ---
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const auth = require("./middleware/auth");
const passport = require("passport"); // NOUVEAU
const TwitchStrategy = require("passport-twitch-new").Strategy; // NOUVEAU
const axios = require("axios"); // NOUVEAU

// --- Configuration de l'application ---
const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares ---
app.use(cors());
app.use(express.json());
app.use(passport.initialize()); // NOUVEAU

// =================================================================
// --- CONFIGURATION DE PASSPORT.JS POUR TWITCH (NOUVEAU) ---
// =================================================================
passport.use(
  new TwitchStrategy(
    {
      clientID: process.env.TWITCH_CLIENT_ID,
      clientSecret: process.env.TWITCH_CLIENT_SECRET,
      callbackURL:
        process.env.TWITCH_CALLBACK_URL ||
        "http://localhost:3001/api/auth/twitch/callback",
      scope: "user:read:email",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // On vérifie si un utilisateur avec cet ID Twitch existe déjà
        let userResult = await pool.query(
          'SELECT * FROM "DbJeuRoro".utilisateur WHERE twitch_id = $1',
          [profile.id]
        );

        if (userResult.rows.length > 0) {
          // L'utilisateur existe, on le renvoie
          return done(null, userResult.rows[0]);
        } else {
          // L'utilisateur n'existe pas, on le crée
          const newUser = await pool.query(
            'INSERT INTO "DbJeuRoro".utilisateur (twitch_id, pseudo, email) VALUES ($1, $2, $3) RETURNING *',
            [profile.id, profile.display_name, profile.email]
          );
          return done(null, newUser.rows[0]);
        }
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

// =================================================================
// --- NOUVELLES ROUTES D'AUTHENTIFICATION TWITCH ---
// =================================================================

// Route #1: L'utilisateur clique sur "Se connecter avec Twitch"
// On le redirige vers le site de Twitch pour l'autorisation.
app.get("/api/auth/twitch", passport.authenticate("twitch"));

// Route #2: Twitch redirige l'utilisateur ici après l'autorisation
app.get(
  "/api/auth/twitch/callback",
  passport.authenticate("twitch", { session: false, failureRedirect: "/" }),
  (req, res) => {
    // À ce stade, Passport a vérifié l'utilisateur et l'a mis dans req.user.
    // On crée notre propre token JWT pour notre application.
    const payload = { user: { id: req.user.id_utilisateur } };
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    // On redirige l'utilisateur vers le frontend avec le token et les infos utilisateur
    // Le frontend devra récupérer ces informations depuis l'URL.
    const userString = encodeURIComponent(JSON.stringify(req.user));
    res.redirect(
      `https://jeurorofrontend.vercel.app?token=${token}&user=${userString}`
    );
  }
);

// =================================================================
// --- ANCIENNES ROUTES (inchangées) ---
// =================================================================
app.post("/api/register", async (req, res) => {
  /* ... code précédent ... */
});
app.post("/api/login", async (req, res) => {
  /* ... code précédent ... */
});
app.post("/api/game/fish", auth, async (req, res) => {
  /* ... code précédent ... */
});
app.get("/api/game/inventory", auth, async (req, res) => {
  /* ... code précédent ... */
});
app.get("/api/store/items", auth, async (req, res) => {
  /* ... code précédent ... */
});
app.post("/api/store/buy/:itemId", auth, async (req, res) => {
  /* ... code précédent ... */
});

// --- Démarrage du serveur ---
app.listen(PORT, () => {
  console.log(`Le serveur est démarré sur le port ${PORT}`);
});
