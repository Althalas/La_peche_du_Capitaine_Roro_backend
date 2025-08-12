// =================================================================
// Fichier : db.js
// Description : Configure et exporte le pool de connexions à la base de données PostgreSQL.
//               Centraliser la connexion ici permet de la réutiliser dans toute l'application.
// =================================================================

const { Pool } = require("pg");

// La configuration du pool de connexions.
const pool = new Pool({
  // Pour Neon, le plus simple est d'utiliser la chaîne de connexion
  // que vous récupérez directement depuis leur tableau de bord.
  // Elle contient toutes les informations (user, password, host, etc.).
  // N'oubliez pas de la mettre entre guillemets.
  connectionString:
    "postgresql://neondb_owner:npg_C7nTDetm3MYX@ep-hidden-bread-a29yfzkl-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
});

// Exporte l'objet pool pour qu'il puisse être utilisé par d'autres fichiers (comme server.js)
module.exports = pool;
