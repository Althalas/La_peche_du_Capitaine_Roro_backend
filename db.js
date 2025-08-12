// =================================================================
// Fichier : db.js
// Description : Configuration de la connexion à la base de données
//               avec gestion explicite du mode SSL pour le déploiement.
// =================================================================

const { Pool } = require("pg");

// Détermine si l'application est en mode production (déployée sur Render)
const isProduction = process.env.NODE_ENV === "production";

// Configuration de la connexion
const connectionConfig = {
  // Utilise la chaîne de connexion de la variable d'environnement
  connectionString: process.env.DATABASE_URL,

  // Active le SSL uniquement en production. C'est une bonne pratique.
  ssl: isProduction ? { rejectUnauthorized: false } : false,
};

const pool = new Pool(connectionConfig);

module.exports = pool;
