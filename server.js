// =================================================================
// Fichier : server.js
// Description : Fichier backend complet avec des logs de débogage pour JWT.
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
// --- ROUTE DE DÉBOGAGE ---
// =================================================================
app.get("/api/debug/db-check", async (req, res) => {
  console.log("Accès à la route de débogage /api/debug/db-check");
  const client = await pool.connect();
  try {
    const result = await client.query(`
            SELECT n.nspname as "schema", c.relname as "table"
            FROM pg_catalog.pg_class c
            LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind = 'r' AND n.nspname <> 'pg_catalog' AND n.nspname <> 'information_schema'
            ORDER BY 1, 2;
        `);
    console.log("Schémas et tables trouvés :", result.rows);
    res.json({
      message:
        "Connexion réussie. Voici les schémas et tables visibles par l'application :",
      tables: result.rows,
    });
  } catch (err) {
    console.error("Erreur lors de la vérification de la BDD :", err);
    res
      .status(500)
      .json({
        message: "Erreur lors de la connexion ou de la requête à la BDD.",
        error: err.message,
      });
  } finally {
    client.release();
  }
});

// =================================================================
// --- ROUTES D'AUTHENTIFICATION ---
// =================================================================
app.post("/api/register", async (req, res) => {
  try {
    const { email, pseudo, password } = req.body;
    if (!email || !pseudo || !password)
      return res.status(400).json({ msg: "Veuillez remplir tous les champs." });

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

    const payload = {
      user: {
        id: user.id_utilisateur,
      },
    };

    const jwtSecret = process.env.JWT_SECRET;

    // --- LOG DE DÉBOGAGE ---
    console.log("Route '/api/login': Vérification du JWT_SECRET.");
    if (!jwtSecret) {
      console.error(
        "Route '/api/login': ERREUR - La variable d'environnement JWT_SECRET est vide ou non définie !"
      );
      return res
        .status(500)
        .send("Erreur de configuration serveur (secret manquant).");
    }
    console.log(
      "Route '/api/login': JWT_SECRET trouvé. Longueur:",
      jwtSecret.length
    );
    // --- FIN LOG ---

    jwt.sign(payload, jwtSecret, { expiresIn: "1h" }, (err, token) => {
      if (err) {
        console.error(
          "Route '/api/login': Erreur lors de la signature du token:",
          err.message
        );
        throw err;
      }
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

// =================================================================
// --- ROUTES DE JEU ---
// =================================================================
app.post("/api/game/fish", auth, async (req, res) => {
  try {
    const userId = req.user.id;
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
      await client.query(
        'INSERT INTO "DbJeuRoro".inventaire (id_utilisateur, id_poisson_type) VALUES ($1, $2)',
        [userId, poissonAttrape.id_poisson_type]
      );
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
    const itemResult = await client.query(
      'SELECT prix FROM "DbJeuRoro".equipement_type WHERE id_equipement_type = $1',
      [itemId]
    );
    if (itemResult.rows.length === 0)
      return res.status(404).json({ msg: "Article non trouvé." });

    const itemPrice = itemResult.rows[0].prix;
    const userResult = await client.query(
      'SELECT argent FROM "DbJeuRoro".utilisateur WHERE id_utilisateur = $1',
      [userId]
    );
    const userMoney = userResult.rows[0].argent;
    if (userMoney < itemPrice)
      return res.status(400).json({ msg: "Vous n'avez pas assez d'argent !" });

    const ownershipCheck = await client.query(
      'SELECT * FROM "DbJeuRoro".utilisateur_equipement WHERE id_utilisateur = $1 AND id_equipement_type = $2',
      [userId, itemId]
    );
    if (ownershipCheck.rows.length > 0)
      return res.status(400).json({ msg: "Vous possédez déjà cet article." });

    const newMoney = userMoney - itemPrice;
    await client.query(
      'UPDATE "DbJeuRoro".utilisateur SET argent = $1 WHERE id_utilisateur = $2',
      [newMoney, userId]
    );
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
