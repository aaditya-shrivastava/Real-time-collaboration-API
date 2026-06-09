const express = require('express');
const router = express.Router();
const {
  createDocument,
  getDocument,
  listDocuments,
  updateDocument,
  deleteDocument,
} = require('../controllers/docController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', listDocuments);
router.post('/', createDocument);
router.get('/:id', getDocument);
router.put('/:id', updateDocument);
router.delete('/:id', deleteDocument);

module.exports = router;
