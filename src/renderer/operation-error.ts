export function operationError(error: unknown, fallback = 'FAILED'): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/SHA256 verification/i.test(message)) return 'ไฟล์บนเซิร์ฟเวอร์ไม่ตรงกับข้อมูล Modpack กรุณาลองใหม่ภายหลัง';
  if (/HTTP (404|410)/i.test(message)) return 'ไม่พบไฟล์ Modpack บนเซิร์ฟเวอร์ กรุณาลองใหม่ภายหลัง';
  if (/ENOSPC/i.test(message)) return 'พื้นที่ในไดรฟ์ไม่เพียงพอ กรุณาเลือกโฟลเดอร์เกมในไดรฟ์อื่น';
  if (/EACCES|EPERM/i.test(message)) return 'เขียนไฟล์ไม่ได้ กรุณาปิดเกมหรือลองเลือกโฟลเดอร์ที่มีสิทธิ์เขียน';
  if (/different file/i.test(message)) return 'โฟลเดอร์ปลายทางมีไฟล์เกมต่างกัน กรุณาเลือกโฟลเดอร์ว่าง';
  if (/outside the current folder/i.test(message)) return 'กรุณาเลือกโฟลเดอร์ใหม่ที่ไม่ซ้อนกับโฟลเดอร์เกมเดิม';
  if (/Stop Minecraft/i.test(message)) return 'กรุณาปิด Minecraft ก่อนดำเนินการต่อ';
  if (/current download|being copied/i.test(message)) return 'กรุณารอให้การดาวน์โหลดหรือคัดลอกไฟล์เสร็จก่อน';
  if (/fetch failed|network|ENOTFOUND|ETIMEDOUT/i.test(message)) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
  return fallback;
}
