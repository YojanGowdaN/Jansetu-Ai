/**
 * Input validation middleware
 */
function validateSignalIngest(req, res, next) {
  const { text, location } = req.body;

  // At minimum need some text or an image
  if (!text && !req.body.image_base64 && !req.body.image_url) {
    return res.status(400).json({ error: 'At least text or an image is required.' });
  }

  // Location is optional but if provided, validate lat/lng
  if (location) {
    if (typeof location.lat !== 'number' || typeof location.lng !== 'number') {
      return res.status(400).json({ error: 'Location must have numeric lat and lng.' });
    }
  }

  next();
}

module.exports = { validateSignalIngest };
