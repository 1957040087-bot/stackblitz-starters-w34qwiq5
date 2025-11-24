import { API_KEY, CATEGORY_LIST } from './constants';
import { Transaction } from './types';

export const callGeminiAPI = async (inputData: any, type: 'text' | 'image' = 'text'): Promise<Partial<Transaction>[]> => {
  const userKey = typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') : null;
  const activeKey = userKey ? userKey.trim() : API_KEY;

  if (!activeKey) {
    console.warn("No API Key provided. Running in Mock Mode.");
    await new Promise(r => setTimeout(r, 1500));
    return [{
      amount: 0,
      type: "expense",
      category: "Khác",
      note: "Vui lòng nhập API Key trong cài đặt để dùng AI thật",
      date: new Date().toISOString()
    }];
  }

  let userContent;

  const systemPrompt = `
  Bạn là một trợ lý tài chính cá nhân người Việt. Nhiệm vụ của bạn là trích xuất thông tin từ văn bản hoặc hình ảnh hóa đơn.

  QUY TẮC XỬ LÝ QUAN TRỌNG (ĐẶC BIỆT VỚI ẢNH MUA HÀNG):
  1. Xử lý Hóa đơn/Lịch sử mua hàng (Ví dụ Shopee, Tiki, List đơn hàng):
     - Nếu ảnh chứa danh sách nhiều đơn hàng, MỖI ĐƠN HÀNG là MỘT mục chi tiêu riêng biệt.
     - **CHỈ LẤY** số tiền ở dòng "Total", "Tổng thanh toán", "Thành tiền", "Total ... items" của từng đơn hàng.
     - **TUYỆT ĐỐI KHÔNG** lấy giá của từng món lẻ bên trong nếu đã có dòng Total của đơn hàng đó.
     - Ví dụ ảnh có: Đơn A (Total 124k), Đơn B (Total 114k). -> Trả về 2 mục: 124000 và 114000.

  2. Số tiền:
     - Chuyển đổi linh hoạt: "50k" -> 50000, "1tr2" -> 1200000, "5 lít" -> 500000.

  3. Phân loại (Category):
     - Chọn CHÍNH XÁC 1 mục trong danh sách: [${CATEGORY_LIST.join(', ')}].
     - Ví dụ: "cắt tóc" -> "Làm đẹp", "đổ xăng" -> "Di chuyển".

  4. OUTPUT:
     - Trả về MỘT MẢNG JSON thuần túy (không markdown, không giải thích).
     - Cấu trúc: [{ "amount": number, "type": "expense"|"income", "category": "string", "note": "string", "date": "YYYY-MM-DD" }]
  `;

  if (type === 'image') {
    userContent = [
      { text: systemPrompt + "\n\nPhân tích chi tiết hình ảnh hóa đơn này:" },
      inputData
    ];
  } else {
    userContent = [
      { text: systemPrompt + `\n\nPhân tích văn bản: "${inputData}"` }
    ];
  }

  const payload = {
    contents: [{ role: "user", parts: userContent }],
    generationConfig: { responseMimeType: "application/json" }
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${activeKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      throw new Error(`Lỗi kết nối AI (${response.status}). Vui lòng kiểm tra API Key.`);
    }

    const data = await response.json();
    const textRes = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const cleanJson = textRes.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error(error);
    throw error;
  }
};
