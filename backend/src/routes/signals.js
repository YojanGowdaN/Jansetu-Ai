const express = require('express');
const crypto = require('crypto');
const { db } = require('../services/data/dbService');
const { geminiService } = require('../services/ai/geminiService');
const { speechService } = require('../services/ai/speechService');
const { matchInfrastructureDefect } = require('../services/matching/defectMatcher');
const { resolveLocation } = require('../services/data/geoService');

const router = express.Router();

const { upload, UPLOAD_DIR } = require('../middleware/upload');
const path = require('path');

/**
 * POST /api/signals/upload-image
 * Upload image file for a signal, returns filename
 */
router.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No valid image file uploaded.' });
  return res.json({ success: true, filename: req.file.filename, path: `/uploads/${req.file.filename}` });
});

/**
 * POST /api/signals/ingest
 * Citizen only sends: text (and optionally image + GPS + audio from browser/WhatsApp).
 * AI auto-detects: category, severity, urgency, language, impact — EVERYTHING.
 */
router.post('/ingest', async (req, res) => {
  try {
    const { text, image_base64, image_mime_type, audio_base64, audio_mime_type, lat, lng, citizen_id, phone_number, report_type } = req.body;

    if (!text && !image_base64 && !audio_base64) {
      return res.status(400).json({ error: 'Please describe your issue, send a photo, or send a voice message.' });
    }

    // Hash phone for privacy
    const phoneHash = phone_number
      ? crypto.createHash('sha256').update(phone_number).digest('hex')
      : 'web-submission';

    // ─── Voice Processing ─────────────────────────────────────────────────
    let voiceTranscript = null;
    let voiceLanguage = null;
    let hasVoice = false;
    let classificationText = text || 'Image submission';

    if (audio_base64) {
      try {
        const audioBuffer = Buffer.from(audio_base64, 'base64');
        const transcription = await speechService.transcribeAudio(
          audioBuffer,
          audio_mime_type || 'audio/ogg'
        );
        // Discard raw audio buffer after processing (privacy)
        // audioBuffer is now eligible for GC

        if (transcription && transcription.transcript && !transcription.transcript.startsWith('[Audio transcription failed')) {
          voiceTranscript = transcription.transcript;
          voiceLanguage = transcription.language;
          hasVoice = true;
          // Use normalized text for classification, fallback to transcript
          classificationText = transcription.normalizedText || transcription.transcript;
          console.log(`[Signals] Voice transcribed: lang=${voiceLanguage}, len=${voiceTranscript.length} chars`);
        } else {
          console.warn('[Signals] Voice transcription returned fallback result');
          // Still allow processing with whatever text was provided
          if (!text && !image_base64) {
            return res.status(422).json({
              error: 'Voice message could not be processed. Please try sending as text.',
              voiceError: true
            });
          }
        }
      } catch (audioErr) {
        console.error('[Signals] Audio processing error:', audioErr.message);
        // Don't fail the entire request — process with text/image if available
        if (!text && !image_base64) {
          return res.status(422).json({
            error: 'Voice message could not be processed. Please try sending as text.',
            voiceError: true
          });
        }
      }
    }

    // AI classifies everything automatically (text or voice transcript)
    const aiResult = await geminiService.classifyCitizenSignal(
      classificationText,
      image_base64 || null,
      image_mime_type || 'image/jpeg'
    );

    const randomId = Math.floor(10000 + Math.random() * 90000);
    const refNumber = (req.body.reference_number || req.body.refNumber || `JS-2026-${randomId}`).trim();

    // Resolve administrative location from GPS / Text
    const resolvedLoc = resolveLocation(lat, lng, classificationText);
    const signalLat = lat || (resolvedLoc.district === 'Ramanagara' ? 12.43 : 16.77);
    const signalLng = lng || (resolvedLoc.district === 'Ramanagara' ? 77.24 : 76.82);

    // Try defect matching
    const defectMatch = matchInfrastructureDefect({ lat: signalLat, lng: signalLng }, aiResult.category);

    // Check if signal with this reference_number already exists (e.g. updating image at Step 3)
    const existingSignal = db.getSignalByRef(refNumber);
    if (existingSignal) {
      if (image_base64) {
        existingSignal.evidence = existingSignal.evidence || {};
        existingSignal.evidence.has_image = true;
        existingSignal.evidence.image_damage_analysis = aiResult.image_damage_analysis || null;
      }
      if (lat && lng) {
        existingSignal.location.lat = signalLat;
        existingSignal.location.lng = signalLng;
        existingSignal.location.auto_detected = true;
        existingSignal.location.generalized_location_str = resolvedLoc.generalized_location_str;
      }
      db.saveSignal(existingSignal);
      return res.status(200).json({
        success: true,
        reference_number: refNumber,
        message: `Signal ${refNumber} updated.`
      });
    }

    // For web portal submissions without explicit refNumber, check duplicate
    if (citizen_id && !req.body.reference_number && !req.body.refNumber) {
      const existingSignals = db.getSignalsByCitizen(citizen_id);
      const duplicate = existingSignals.find(s => {
        const sameCategory = s.category === aiResult.category;
        const isRecent = (Date.now() - new Date(s.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000; // within 7 days
        const textToCheck = classificationText;
        const similarText = textToCheck && s.raw_input_text && (
          s.raw_input_text.toLowerCase().includes(textToCheck.toLowerCase().substring(0, 30)) ||
          textToCheck.toLowerCase().includes(s.raw_input_text.toLowerCase().substring(0, 30))
        );
        return sameCategory && isRecent && similarText;
      });

      if (duplicate) {
        return res.status(409).json({
          duplicate: true,
          message: `You have already reported a similar ${aiResult.category} issue on ${new Date(duplicate.created_at).toLocaleDateString('en-IN')}. Your existing reference number is ${duplicate.reference_number}. You can track its progress using this number.`,
          existing_reference: duplicate.reference_number,
          existing_status: duplicate.status
        });
      }
    }

    let resolvedPhone = phone_number || null;
    if (!resolvedPhone && citizen_id) {
      if (citizen_id.includes('@') || citizen_id.length >= 10) {
        resolvedPhone = citizen_id;
      }
      const userProfile = db.findCitizenById(citizen_id);
      if (userProfile && userProfile.phone) {
        resolvedPhone = userProfile.phone;
      }
    }

    const newSignal = {
      id: `SIG-${randomId}`,
      reference_number: refNumber,
      citizen_id: citizen_id || resolvedPhone || null,
      phone_number: resolvedPhone || citizen_id || null,
      phone_number_hash: phoneHash,
      language: voiceLanguage || aiResult.language || 'en',
      raw_input_text: hasVoice ? voiceTranscript : (text || '[Image Only]'),
      translated_english_text: aiResult.translated_english_text || classificationText,
      category: aiResult.category,
      sub_category: aiResult.problem_summary,
      severity: aiResult.severity,
      potential_impact: aiResult.potential_impact,
      urgency: aiResult.urgency,
      location: {
        lat: signalLat,
        lng: signalLng,
        auto_detected: !!(lat && lng),
        village_ward: resolvedLoc.village_ward,
        taluk_block: resolvedLoc.taluk_block,
        district: resolvedLoc.district,
        state: resolvedLoc.state,
        generalized_location_str: resolvedLoc.generalized_location_str,
        // Standardized administrative codes
        stateCode: resolvedLoc.stateCode || null,
        districtCode: resolvedLoc.districtCode || null,
        subdistrictCode: resolvedLoc.subdistrictCode || null,
        geoSource: resolvedLoc.geoSource || null,
      },
      evidence: {
        has_text: !!text,
        has_image: !!image_base64,
        has_voice: hasVoice,
        has_location: !!(lat && lng),
        transcriptAvailable: hasVoice,
        voiceLanguage: voiceLanguage || null,
        confidence_score: aiResult.confidence_score || 0.85,
        image_damage_analysis: aiResult.image_damage_analysis || null,
        image_filename: req.body.image_filename || null,
      },
      defect_match: defectMatch.matched ? defectMatch : null,
      report_type: report_type || 'EXISTING_DAMAGED',
      consent_confirmed: true,
      status: 'ANALYZED',
      created_at: new Date().toISOString(),
    };

    db.addSignal(newSignal);

    // Send instant WhatsApp Registration Receipt to citizen
    if (resolvedPhone) {
      fetch(`http://localhost:${process.env.PORT || 10000}/notify-registered`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_number: refNumber,
          phone_number: resolvedPhone,
          category: aiResult.category,
          location: resolvedLoc.generalized_location_str || 'Local Jurisdiction',
          language: voiceLanguage || aiResult.language || 'en',
          summary: aiResult.problem_summary || text || ''
        })
      }).catch(err => {
        console.warn(`[Signals] WhatsApp registration notify warning: ${err.message}`);
      });
    }

    return res.status(201).json({
      success: true,
      reference_number: refNumber,
      ai_analysis: {
        category: aiResult.category,
        severity: aiResult.severity,
        urgency: aiResult.urgency,
        potential_impact: aiResult.potential_impact,
        language_detected: voiceLanguage || aiResult.language,
        translated_text: aiResult.translated_english_text,
        problem_summary: aiResult.problem_summary,
        confidence: aiResult.confidence_score,
        voice_processed: hasVoice,
      },
      // Citizen-facing fields
      category: aiResult.category,
      severity: aiResult.severity,
      potential_impact: aiResult.potential_impact,
      defect_matching_notice: defectMatch.matched ? defectMatch.recommendation_note : null,
      message: `Your request has been analyzed and logged. Reference: ${refNumber}`,
    });
  } catch (err) {
    console.error('[Signals] Ingest error:', err);
    return res.status(500).json({ error: 'Failed to process your request. Please try again.' });
  }
});

/**
 * POST /api/signals/clear
 */
router.post('/clear', (_req, res) => {
  db.clearAllData();
  return res.json({ success: true, message: 'All data cleared.' });
});

/**
 * GET /api/signals/track/:refNumber
 */
router.get('/track/:refNumber', (req, res) => {
  const signal = db.getSignalByRef(req.params.refNumber);
  if (!signal) {
    return res.status(404).json({ error: `No request found with code: ${req.params.refNumber}` });
  }

  // Privacy: do not expose precise GPS in tracking response
  return res.json({
    reference_number: signal.reference_number,
    category: signal.category,
    severity: signal.severity,
    potential_impact: signal.potential_impact,
    generalized_location: signal.location.generalized_location_str,
    district: signal.location.district,
    state: signal.location.state,
    status: signal.status,
    created_at: signal.created_at,
    reporters_count: signal.reporters_count || 1,
    community_reports_count: signal.reporters_count || 1,
    latest_action: signal.latest_action || null,
    latest_action_notes: signal.latest_action_notes || null,
    updated_by: signal.updated_by || null,
    updated_at: signal.updated_at || null,
    ai_analysis: {
      language: signal.language,
      translated_text: signal.translated_english_text,
      problem_summary: signal.sub_category,
      voice_processed: signal.evidence ? signal.evidence.has_voice : false,
    },
    evidence_types: {
      text: signal.evidence ? signal.evidence.has_text : false,
      image: signal.evidence ? signal.evidence.has_image : false,
      voice: signal.evidence ? signal.evidence.has_voice : false,
      location: signal.evidence ? signal.evidence.has_location : false,
    },
    status_timeline: [
      { step: 'Reported', completed: true },
      { step: 'AI Analyzed', completed: true },
      { step: 'Assigned', completed: ['ASSIGNED', 'UNDER_REVIEW', 'ACTION_TAKEN', 'VERIFIED', 'RESOLVED'].includes(signal.status) },
      { step: 'Under Review', completed: ['UNDER_REVIEW', 'ACTION_TAKEN', 'VERIFIED', 'RESOLVED'].includes(signal.status) },
      { step: 'Action Taken', completed: ['ACTION_TAKEN', 'VERIFIED', 'RESOLVED'].includes(signal.status) },
      { step: 'Resolved', completed: ['VERIFIED', 'RESOLVED'].includes(signal.status) },
    ],
  });
});

/**
 * GET /api/signals/my-requests/:citizenId
 * Also accepts ?phone=XXXXXXXXXX query param for cross-channel matching
 */
router.get('/my-requests/:citizenId', (req, res) => {
  const citizenId = req.params.citizenId;
  let signals = db.getSignalsByCitizen(citizenId);
  
  // Also try phone-based lookup if the citizen profile has a phone number
  const citizen = db.findCitizenById(citizenId);
  if (citizen && citizen.phone) {
    const phoneSignals = db.getSignalsByCitizen(citizen.phone);
    // Merge, avoiding duplicates by reference_number
    const refSet = new Set(signals.map(s => s.reference_number));
    for (const s of phoneSignals) {
      if (!refSet.has(s.reference_number)) {
        signals.push(s);
        refSet.add(s.reference_number);
      }
    }
  }

  // Also try with phone from query param
  const queryPhone = req.query.phone;
  if (queryPhone) {
    const phoneSignals = db.getSignalsByCitizen(queryPhone);
    const refSet = new Set(signals.map(s => s.reference_number));
    for (const s of phoneSignals) {
      if (!refSet.has(s.reference_number)) {
        signals.push(s);
        refSet.add(s.reference_number);
      }
    }
  }

  return res.json({ count: signals.length, signals });
});

/**
 * GET /api/signals
 * Returns all signals, optionally filtered by jurisdiction for officers
 */
router.get('/', (req, res) => {
  const { district, category, status, stateCode, districtCode, raw, ungrouped } = req.query;
  const signals = db.getSignals({ district, category, status, stateCode, districtCode, raw, ungrouped });

  // Privacy: generalize GPS for API consumers — do not expose precise citizen coordinates
  const safeSignals = signals.map(s => {
    const safe = { ...s };
    if (safe.location) {
      safe.location = { ...safe.location };
      // Round coordinates to ~1km precision for API consumers
      if (safe.location.lat) safe.location.lat = Math.round(safe.location.lat * 100) / 100;
      if (safe.location.lng) safe.location.lng = Math.round(safe.location.lng * 100) / 100;
    }
    return safe;
  });

  return res.json({ count: safeSignals.length, signals: safeSignals });
});

/**
 * GET /api/signals/notifications/:citizenId
 * Get notifications for a citizen
 */
router.get('/notifications/:citizenId', (req, res) => {
  const { getNotificationsForUser } = require('../services/notifications/notificationService');
  const notifications = getNotificationsForUser(req.params.citizenId);
  return res.json({ count: notifications.length, notifications });
});

/**
 * POST /api/signals/:refNumber/rate
 * Citizen rates their experience after resolution
 */
router.post('/:refNumber/rate', (req, res) => {
  const { refNumber } = req.params;
  const { rating, feedback } = req.body;
  
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5.' });
  }

  const signal = db.getSignalByRef(refNumber);
  if (!signal) return res.status(404).json({ error: 'Signal not found.' });

  signal.citizen_rating = rating;
  signal.citizen_feedback = feedback || '';
  signal.rated_at = new Date().toISOString();
  db.saveSignal(signal);

  return res.json({ success: true, message: 'Thank you for your feedback.' });
});

/**
 * PATCH /api/signals/:refNumber/status
 * Authorized officer updates case status (e.g. UNDER_REVIEW, ACTION_TAKEN, RESOLVED)
 * Automatically updates ALL linked/co-reported citizen tickets under this problem cluster and notifies all citizens!
 */
router.patch('/:refNumber/status', (req, res) => {
  const { refNumber } = req.params;
  const { status, action, notes, officer_name, officer_role } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status is required.' });
  }

  const result = db.updateSignalStatus(refNumber, status, {
    action: action || `Status changed to ${status}`,
    notes: notes || '',
    officer_name: officer_name || 'Authorized Officer',
    officer_role: officer_role || 'DEPARTMENT_OFFICER'
  });

  if (!result) {
    return res.status(404).json({ error: `Signal ${refNumber} not found.` });
  }

  const { signal, affectedSignals, targetPhones, targetCitizenIds } = result;

  // 1. Send In-App Notification to ALL affected citizen accounts under this cluster ticket
  const { sendNotification } = require('../services/notifications/notificationService');
  const statusLabels = {
    UNDER_REVIEW: 'Under Investigation',
    ACTION_TAKEN: 'Action Taken by Department',
    VERIFIED: 'Field Verified',
    RESOLVED: 'Case Resolved'
  };

  targetCitizenIds.forEach(citizenId => {
    sendNotification({
      type: 'STATUS_UPDATE',
      recipient_id: citizenId,
      channel: 'IN_APP',
      subject: `Case ${refNumber} (${signal.category}) Updated`,
      message: `Your reported issue (${signal.category}) in ${signal.location?.generalized_location_str || 'your locality'} has been updated to: ${statusLabels[status] || status}. ${notes ? 'Official notes: ' + notes : ''}`,
      reference_number: refNumber
    });
  });

  // 2. Dispatch WhatsApp Community Broadcast to ALL citizens who reported this problem
  const sendAlert = (aiUpdate = {}) => {
    targetPhones.forEach(phone => {
      fetch(`http://localhost:${process.env.PORT || 10000}/notify-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_number: refNumber,
          phone_number: phone,
          category: signal.category,
          status: status,
          location: signal.location?.generalized_location_str || 'Local Jurisdiction',
          officer_name: officer_name || 'Authorized Officer',
          officer_role: officer_role || 'DEPARTMENT_OFFICER',
          notes: notes || '',
          reporters_count: affectedSignals.length,
          ai_summary_en: aiUpdate?.summary_en || (notes ? `Official update: ${notes}` : `Status updated to ${status}.`),
          ai_summary_kn: aiUpdate?.summary_kn || (notes ? `ಅಧಿಕಾರಿ ಟಿಪ್ಪಣಿ: ${notes}` : `ದೂರು ${status} ಸ್ಥಿತಿಗೆ ನವೀಕರಿಸಲಾಗಿದೆ.`),
          ai_summary_hi: aiUpdate?.summary_hi || (notes ? `अधिकारी टिप्पणी: ${notes}` : `स्थिति ${status} में अपडेट की गई।`),
          citizen_advice: aiUpdate?.citizen_advice || 'Thank you for your report.',
          language: signal.language || 'kn'
        })
      }).catch(err => {
        console.warn(`[Signals] WhatsApp notify warning for ${phone}: ${err.message}`);
      });
    });
  };

  try {
    const { geminiService } = require('../services/ai/geminiService');
    geminiService.analyzeOfficerUpdate({
      status,
      notes: notes || '',
      category: signal.category,
      location: signal.location?.generalized_location_str,
      language: signal.language || 'kn'
    }).then(aiUpdate => {
      sendAlert(aiUpdate);
    }).catch(() => {
      sendAlert();
    });
  } catch (_) {
    sendAlert();
  }

  return res.json({
    success: true,
    message: `Case ${refNumber} status updated to ${status} and broadcasted to ${targetCitizenIds.length} citizen(s) (${affectedSignals.length} linked report(s)).`,
    signal: signal,
    affected_signals_count: affectedSignals.length,
    notified_citizens_count: targetCitizenIds.length
  });
});

module.exports = router;
