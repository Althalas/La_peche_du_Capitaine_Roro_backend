// =================================================================
// Fichier : server.js
// Description : Fichier backend complet avec le nom du schéma dans les requêtes.
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
app.post("/api/register", async (req, res) => {
  try {
    const { email, pseudo, password } = req.body;
    if (!email || !pseudo || !password)
      return res.status(400).json({ msg: "Veuillez remplir tous les champs." });

    // CORRECTION : Ajout du nom du schéma
    const userExists = await pool.query(
      'SELECT * FROM "DbJeuRoro".utilisateur WHERE email = $1 OR pseudo = $2',
      [email, pseudo]
    );
    if (userExists.rows.length > 0)
      return res
        .status(400)
        .json({ msg: "Un utilisateur avec cet email ou pseudo existe déjà." });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // CORRECTION : Ajout du nom du schéma
    const newUser = await pool.query(
      'INSERT INTO "DbJeuRoro".utilisateur (email, pseudo, mot_de_passe_hashe) VALUES ($1, $2, $3) RETURNING id_utilisateur, pseudo, email, argent',
      [email, pseudo, passwordHash]
    );
    res
      .status(201)
      .json({ msg: "Utilisateur créé avec succès !", user: newUser.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur Serveur");
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ msg: "Veuillez remplir tous les champs." });

    // CORRECTION : Ajout du nom du schéma
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

    const payload = { user: { id: user.id_utilisateur } };
    jwt.sign(
      process.env.JWT_SECRET || "mon_secret_jwt_super_secret",
      payload,
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
app.post("/api/game/fish", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    // CORRECTION : Ajout du nom du schéma
    const poissonsTypes = await pool.query(
      'SELECT * FROM "DbJeuRoro".poisson_type'
    );
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
    if (!poissonAttrape)
      return res.json({ msg: "Dommage, ça n'a pas mordu..." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // CORRECTION : Ajout du nom du schéma
      await client.query(
        'INSERT INTO "DbJeuRoro".inventaire (id_utilisateur, id_poisson_type) VALUES ($1, $2)',
        [userId, poissonAttrape.id_poisson_type]
      );
      // CORRECTION : Ajout du nom du schéma
      const updatedUser = await client.query(
        'UPDATE "DbJeuRoro".utilisateur SET argent = argent + $1 WHERE id_utilisateur = $2 RETURNING argent',
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

app.get("/api/game/inventory", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    // CORRECTION : Ajout du nom du schéma
    const inventoryData = await pool.query(
      'SELECT pt.nom, pt.valeur, pt.emoji FROM "DbJeuRoro".inventaire i JOIN "DbJeuRoro".poisson_type pt ON i.id_poisson_type = pt.id_poisson_type WHERE i.id_utilisateur = $1 ORDER BY i.date_capture DESC',
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
app.get("/api/store/items", auth, async (req, res) => {
  try {
    // CORRECTION : Ajout du nom du schéma
    const items = await pool.query(
      'SELECT * FROM "DbJeuRoro".equipement_type ORDER BY prix ASC'
    );
    res.json(items.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Erreur Serveur");
  }
});

app.post("/api/store/buy/:itemId", auth, async (req, res) => {
  const userId = req.user.id;
  const { itemId } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // CORRECTION : Ajout du nom du schéma
    const itemResult = await client.query(
      'SELECT prix FROM "DbJeuRoro".equipement_type WHERE id_equipement_type = $1',
      [itemId]
    );
    if (itemResult.rows.length === 0)
      return res.status(404).json({ msg: "Article non trouvé." });

    const itemPrice = itemResult.rows[0].prix;
    // CORRECTION : Ajout du nom du schéma
    const userResult = await client.query(
      'SELECT argent FROM "DbJeuRoro".utilisateur WHERE id_utilisateur = $1',
      [userId]
    );
    const userMoney = userResult.rows[0].argent;
    if (userMoney < itemPrice)
      return res.status(400).json({ msg: "Vous n'avez pas assez d'argent !" });

    // CORRECTION : Ajout du nom du schéma
    const ownershipCheck = await client.query(
      'SELECT * FROM "DbJeuRoro".utilisateur_equipement WHERE id_utilisateur = $1 AND id_equipement_type = $2',
      [userId, itemId]
    );
    if (ownershipCheck.rows.length > 0)
      return res.status(400).json({ msg: "Vous possédez déjà cet article." });

    const newMoney = userMoney - itemPrice;
    // CORRECTION : Ajout du nom du schéma
    await client.query(
      'UPDATE "DbJeuRoro".utilisateur SET argent = $1 WHERE id_utilisateur = $2',
      [newMoney, userId]
    );
    // CORRECTION : Ajout du nom du schéma
    await client.query(
      'INSERT INTO "DbJeuRoro".utilisateur_equipement (id_utilisateur, id_equipement_type) VALUES ($1, $2)',
      [userId, itemId]
    );

    await client.query("COMMIT");
    res.json({ msg: "Achat réussi !", nouvelArgent: newMoney });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err.message);
    if (err.code === "23505")
      return res.status(400).json({ msg: "Vous possédez déjà cet article." });
    res.status(500).send("Erreur Serveur");
  } finally {
    client.release();
  }
});

// --- Démarrage du serveur ---
app.listen(PORT, () => {
  console.log(`Le serveur est démarré sur le port ${PORT}`);
});
