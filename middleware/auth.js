// =================================================================
// Fichier : server.js
// Description : Fichier backend complet avec la correction pour la signature JWT.
// =================================================================

// --- Imports ---
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const auth = require("./auth");

// --- Configuration de l'application ---
const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// ... (La route de débogage et la route /api/register restent inchangées) ...
app.get("/api/debug/db-check", async (req, res) => {
  /* ... code précédent ... */
});
app.post("/api/register", async (req, res) => {
  /* ... code précédent ... */
});

// =================================================================
// --- ROUTE DE CONNEXION (CORRIGÉE) ---
// =================================================================
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ msg: "Veuillez remplir tous les champs." });

    const userResult = await pool.query(
      'SELECT * FROM "DbJeuRoro".utilisateur WHERE email = $1',
      [email]
    );
    if (userResult.rows.length === 0)
      return res.status(400).json({ msg: "Identifiants invalides." });

    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.mot_de_passe_hashe);
    if (!isMatch)
      return res.status(400).json({ msg: "Identifiants invalides." });

    // Le "payload" contient les informations que l'on veut stocker dans le jeton
    const payload = {
      user: {
        id: user.id_utilisateur,
      },
    };

    // La clé secrète doit être récupérée depuis les variables d'environnement
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error(
        "ERREUR: La variable d'environnement JWT_SECRET n'est pas définie !"
      );
      return res.status(500).send("Erreur de configuration serveur.");
    }

    // CORRECTION : La fonction jwt.sign prend (payload, secret, options, callback)
    jwt.sign(payload, jwtSecret, { expiresIn: "1h" }, (err, token) => {
      if (err) throw err;
      res.json({
        token,
        user: {
          id: user.id_utilisateur,
          pseudo: user.pseudo,
          email: user.email,
          argent: user.argent,
        },
      });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur Serveur");
  }
});

// ... (Le reste des routes de jeu et du magasin restent inchangées) ...
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
