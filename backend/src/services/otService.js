/**
 * Operational Transformation Service
 * Handles concurrent edit conflict resolution for plain-text documents.
 *
 * Operations:
 *   { type: 'insert', position: Number, text: String }
 *   { type: 'delete', position: Number, length: Number }
 *   { type: 'noop' }
 */

const applyOperation = (content, op) => {
  if (!op || op.type === 'noop') return content;

  if (op.type === 'insert') {
    const pos = Math.min(op.position, content.length);
    return content.slice(0, pos) + op.text + content.slice(pos);
  }

  if (op.type === 'delete') {
    const pos = Math.min(op.position, content.length);
    const end = Math.min(pos + op.length, content.length);
    return content.slice(0, pos) + content.slice(end);
  }

  return content;
};

/**
 * Transform op1 against op2 so op1 can be applied after op2.
 */
const transform = (op1, op2) => {
  if (!op1 || op1.type === 'noop' || !op2 || op2.type === 'noop') return op1;

  if (op1.type === 'insert' && op2.type === 'insert') {
    if (op2.position <= op1.position) {
      return { ...op1, position: op1.position + op2.text.length };
    }
    return op1;
  }

  if (op1.type === 'insert' && op2.type === 'delete') {
    if (op2.position + op2.length <= op1.position) {
      return { ...op1, position: op1.position - op2.length };
    }
    if (op2.position >= op1.position) return op1;
    return { ...op1, position: op2.position };
  }

  if (op1.type === 'delete' && op2.type === 'insert') {
    if (op2.position <= op1.position) {
      return { ...op1, position: op1.position + op2.text.length };
    }
    if (op2.position >= op1.position + op1.length) return op1;
    return { ...op1, length: op1.length + op2.text.length };
  }

  if (op1.type === 'delete' && op2.type === 'delete') {
    const op1End = op1.position + op1.length;
    const op2End = op2.position + op2.length;

    if (op2End <= op1.position) {
      return { ...op1, position: op1.position - op2.length };
    }
    if (op2.position >= op1End) return op1;

    // Overlapping deletes
    const newPos = Math.min(op1.position, op2.position);
    const overlapStart = Math.max(op1.position, op2.position);
    const overlapEnd = Math.min(op1End, op2End);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    const newLength = op1.length - overlap;

    return newLength <= 0
      ? { type: 'noop' }
      : { ...op1, position: newPos < op1.position ? op2.position : op1.position - (op2.position < op1.position ? op2.length - (overlapEnd - op1.position) : 0), length: newLength };
  }

  return op1;
};

module.exports = { applyOperation, transform };
