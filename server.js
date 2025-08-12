// =================================================================
// Fichier : server.js
// Description : Fichier backend complet pour l'application Pêche-Ami.
// =================================================================

// --- Imports ---
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");
const auth = require("./middleware/auth");

// --- Configuration de l'application ---
const app = express();
const PORT = process.env.PORT || 3001;

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// =================================================================
// --- ROUTES D'AUTHENTIFICATION ---
// =================================================================

/**
 * @route   POST /api/register
 * @desc    Inscrire un nouvel utilisateur
 */
app.post("/api/register", async (req, res) => {
  try {
    const { email, pseudo, password } = req.body;
    if (!email || !pseudo || !password) {
      return res.status(400).json({ msg: "Veuillez remplir tous les champs." });
    }
    const userExists = await pool.query(
      "SELECT * FROM Utilisateur WHERE email = $1 OR pseudo = $2",
      [email, pseudo]
    );
    if (userExists.rows.length > 0) {
      return res
        .status(400)
        .json({ msg: "Un utilisateur avec cet email ou pseudo existe déjà." });
    }
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const newUser = await pool.query(
      "INSERT INTO Utilisateur (email, pseudo, mot_de_passe_hashe) VALUES ($1, $2, $3) RETURNING id_utilisateur, pseudo, email, argent",
      [email, pseudo, passwordHash]
    );
    res.status(201).json({
      msg: "Utilisateur créé avec succès !",
      user: newUser.rows[0],
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur Serveur");
  }
});

/**
 * @route   POST /api/login
 * @desc    Connecter un utilisateur et renvoyer un token JWT
 */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ msg: "Veuillez remplir tous les champs." });
    }
    const userResult = await pool.query(
      "SELECT * FROM Utilisateur WHERE email = $1",
      [email]
    );
    if (userResult.rows.length === 0) {
      return res.status(400).json({ msg: "Identifiants invalides." });
    }
    const user = userResult.rows[0];
    const isMatch = await bcrypt.compare(password, user.mot_de_passe_hashe);
    if (!isMatch) {
      return res.status(400).json({ msg: "Identifiants invalides." });
    }
    const payload = { user: { id: user.id_utilisateur } };
    jwt.sign(
      payload,
      "mon_secret_jwt_super_secret",
      { expiresIn: "1h" },
      (err, token) => {
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
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur Serveur");
  }
});

// =================================================================
// --- ROUTES DE JEU ---
// =================================================================

/**
 * @route   POST /api/game/fish
 * @desc    Un utilisateur authentifié tente de pêcher.
 * @access  Privé
 */
app.post("/api/game/fish", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const poissonsTypes = await pool.query("SELECT * FROM Poisson_Type");
    const chance = Math.random();
    let poissonAttrape = null;
    let cumulRarete = 0;
    for (const poisson of poissonsTypes.rows) {
      cumulRarete += parseFloat(poisson.rarete);
      if (chance < cumulRarete) {
        poissonAttrape = poisson;
        break;
      }
    }
    if (!poissonAttrape) {
      return res.json({ msg: "Dommage, ça n'a pas mordu..." });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "INSERT INTO Inventaire (id_utilisateur, id_poisson_type) VALUES ($1, $2)",
        [userId, poissonAttrape.id_poisson_type]
      );
      const updatedUser = await client.query(
        "UPDATE Utilisateur SET argent = argent + $1 WHERE id_utilisateur = $2 RETURNING argent",
        [poissonAttrape.valeur, userId]
      );
      await client.query("COMMIT");
      res.json({
        msg: `Vous avez pêché un ${poissonAttrape.nom} !`,
        poisson: poissonAttrape,
        nouvelArgent: updatedUser.rows[0].argent,
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur Serveur");
  }
});

/**
 * @route   GET /api/game/inventory
 * @desc    Récupérer l'inventaire d'un utilisateur
 * @access  Privé
 */
app.get("/api/game/inventory", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const inventoryData = await pool.query(
      "SELECT pt.nom, pt.valeur, pt.emoji FROM Inventaire i JOIN Poisson_Type pt ON i.id_poisson_type = pt.id_poisson_type WHERE i.id_utilisateur = $1 ORDER BY i.date_capture DESC",
      [userId]
    );
    res.json(inventoryData.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur Serveur");
  }
});

// =================================================================
// --- ROUTES DU MAGASIN ---
// =================================================================

/**
 * @route   GET /api/store/items
 * @desc    Récupérer la liste des articles disponibles dans le magasin.
 * @access  Privé
 */
app.get("/api/store/items", auth, async (req, res) => {
  try {
    const items = await pool.query(
      "SELECT * FROM Equipement_Type ORDER BY prix ASC"
    );
    res.json(items.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur Serveur");
  }
});

/**
 * @route   POST /api/store/buy/:itemId
 * @desc    Acheter un article du magasin.
 * @access  Privé
 */
app.post("/api/store/buy/:itemId", auth, async (req, res) => {
  const userId = req.user.id;
  const { itemId } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const itemResult = await client.query(
      "SELECT prix FROM Equipement_Type WHERE id_equipement_type = $1",
      [itemId]
    );
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ msg: "Article non trouvé." });
    }
    const itemPrice = itemResult.rows[0].prix;
    const userResult = await client.query(
      "SELECT argent FROM Utilisateur WHERE id_utilisateur = $1",
      [userId]
    );
    const userMoney = userResult.rows[0].argent;
    if (userMoney < itemPrice) {
      return res.status(400).json({ msg: "Vous n'avez pas assez d'argent !" });
    }
    const ownershipCheck = await client.query(
      "SELECT * FROM Utilisateur_Equipement WHERE id_utilisateur = $1 AND id_equipement_type = $2",
      [userId, itemId]
    );
    if (ownershipCheck.rows.length > 0) {
      return res.status(400).json({ msg: "Vous possédez déjà cet article." });
    }
    const newMoney = userMoney - itemPrice;
    await client.query(
      "UPDATE Utilisateur SET argent = $1 WHERE id_utilisateur = $2",
      [newMoney, userId]
    );
    await client.query(
      "INSERT INTO Utilisateur_Equipement (id_utilisateur, id_equipement_type) VALUES ($1, $2)",
      [userId, itemId]
    );
    await client.query("COMMIT");
    res.json({
      msg: "Achat réussi !",
      nouvelArgent: newMoney,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err.message);
    if (err.code === "23505") {
      return res.status(400).json({ msg: "Vous possédez déjà cet article." });
    }
    res.status(500).send("Erreur Serveur");
  } finally {
    client.release();
  }
});

// --- Démarrage du serveur ---
app.listen(PORT, () => {
  console.log(`Le serveur est démarré sur le port ${PORT}`);
});
