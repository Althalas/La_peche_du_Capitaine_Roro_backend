// =================================================================
// Fichier : middleware/auth.js
// Description : Middleware pour vérifier le token JWT et protéger les routes.
// =================================================================
const jwt = require("jsonwebtoken");

module.exports = function (req, res, next) {
  // 1. Récupérer le token du header de la requête
  const token = req.header("Authorization");
  if (!token) {
    return res.status(401).json({ msg: "Accès non autorisé, token manquant." });
  }

  // Le token est souvent envoyé sous la forme "Bearer <token>", on ne garde que le token.
  const actualToken = token.split(" ")[1];
  if (!actualToken) {
    return res.status(401).json({ msg: "Format de token invalide." });
  }

  // 3. Vérifier la validité du token
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error(
        "ERREUR: La variable d'environnement JWT_SECRET n'est pas définie !"
      );
      return res.status(500).send("Erreur de configuration serveur.");
    }

    const decoded = jwt.verify(actualToken, jwtSecret);

    // 4. Ajouter l'utilisateur du payload du token à l'objet de la requête
    req.user = decoded.user;
    next(); // Passer à la prochaine étape (la route protégée)
  } catch (err) {
    res.status(401).json({ msg: "Token invalide." });
  }
};
