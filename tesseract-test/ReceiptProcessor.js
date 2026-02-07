/**
 * ReceiptProcessor.js
 *
 * This module uses Tesseract.js to perform OCR on receipt images and extract text.
 * It defines a function `ProcessReceipt` that takes an image path as input and returns the extracted text.
 * The function logs the extracted text to the console.
 */
import Tesseract from "tesseract.js";
/*
function processreceipt(image) {
    Tesseract.recognize(
         image,
         'eng',
        { logger: m => console.log(m) })
        .then(({ data: { text: receiptText } }) => {
    console.log('------------------------------------------');
    console.log("Receipt processing initiated...\n:");
    console.log(receiptText);
    return receiptText;
});

    
}
*/

export async function processReceipt(image) {
  const {
    data: { text },
  } = await Tesseract.recognize(image, "eng");

  console.log("Receipt processing initiated...\n");
  console.log(text);

  return text;
}

// Example
processReceipt("test.jpg");
console.log(processReceipt("test.jpg"));
