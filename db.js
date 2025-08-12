// =================================================================
// Fichier : db.js
// Description : Configuration de la connexion à la base de données
//               avec gestion du schéma et du mode SSL pour le déploiement.
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

  // NOUVEAU : Spécifier le schéma à utiliser
  // Cela résout l'erreur "relation does not exist" car vos tables sont dans le schéma "DbJeuRoro".
  // L'application saura maintenant où chercher les tables.
  options: `-c search_path="DbJeuRoro",public`,
};

const pool = new Pool(connectionConfig);

// Log de débogage pour vérifier la configuration au démarrage
console.log("--- Configuration de la base de données ---");
console.log(`Mode Production: ${isProduction}`);
if (process.env.DATABASE_URL) {
  const urlParts = new URL(process.env.DATABASE_URL);
  console.log(`Host: ${urlParts.hostname}`);
  console.log(`User: ${urlParts.username}`);
  console.log(`Database: ${urlParts.pathname.substring(1)}`);
} else {
  console.log("DATABASE_URL non définie.");
}
console.log("------------------------------------");

module.exports = pool;
