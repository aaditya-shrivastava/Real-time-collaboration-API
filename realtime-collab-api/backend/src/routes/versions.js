const express = require('express');
const router = express.Router({ mergeParams: true });
const { getVersions, rollback } = require('../controllers/versionController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', getVersions);
router.post('/rollback/:versionNumber', rollback);

module.exports = router;
