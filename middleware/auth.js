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

    // --- LOG DE DÉBOGAGE ---
    console.log("Middleware 'auth': Vérification du JWT_SECRET.");
    if (!jwtSecret) {
      console.error(
        "Middleware 'auth': ERREUR - La variable d'environnement JWT_SECRET est vide ou non définie !"
      );
      return res
        .status(500)
        .send("Erreur de configuration serveur (secret manquant).");
    }
    console.log(
      "Middleware 'auth': JWT_SECRET trouvé. Longueur:",
      jwtSecret.length
    );
    // --- FIN LOG ---

    const decoded = jwt.verify(actualToken, jwtSecret);

    // 4. Ajouter l'utilisateur du payload du token à l'objet de la requête
    req.user = decoded.user;
    next(); // Passer à la prochaine étape (la route protégée)
  } catch (err) {
    // Log de l'erreur spécifique pour un meilleur débogage
    console.error(
      "Middleware 'auth': Erreur lors de la vérification du token:",
      err.message
    );
    res.status(401).json({ msg: "Token invalide." });
  }
};
