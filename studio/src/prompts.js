import { componentDoc, styleDoc, COMPONENTS } from './spec.js';
import { FONTS } from './styles.js';

export function leadFacts(lead) {
  const lines = [
    `Tên doanh nghiệp: ${lead.name}`,
    `Ngành: ${lead.industry}${lead.category ? ` (Google ghi: ${lead.category})` : ''}`,
    `Khu vực: ${lead.area}${lead.address ? ` — địa chỉ: ${lead.address}` : ''}`,
    `SĐT: ${lead.phone}`,
    lead.emails ? `Email: ${lead.emails}` : null,
    lead.rating ? `Đánh giá: ${lead.rating}★ với ${lead.review_count} lượt review` : `Số review: ${lead.review_count}`,
    `Hiện trạng website: ${lead.website_label}${lead.website_url ? ` (${lead.website_url})` : ''}`,
    lead.web_reachable === false ? 'LỖI NGHIÊM TRỌNG: Website hiện không truy cập được (sập/hết hạn)' : null,
    lead.has_ssl === false ? 'LỖI BẢO MẬT: Website chưa có SSL (http, Chrome/Safari cảnh báo "Không an toàn")' : null,
    lead.is_mobile_friendly === false ? 'LỖI HIỂN THỊ: Website vỡ khung/chữ nhỏ trên điện thoại' : null,
    lead.copyright_year && lead.copyright_year < 2021 ? `HỆ THỐNG CŨ: Website ghi copyright năm ${lead.copyright_year}` : null,
    lead.cms ? `Nền tảng web hiện tại: ${lead.cms}` : null,
    lead.fb_followers ? `Fanpage: ${lead.fb_followers} người theo dõi${lead.fb_running_ads ? ' (ĐANG CHẠY QUẢNG CÁO FACEBOOK)' : ''}` : null,
    lead.score_reasons ? `Ghi chú chấm điểm: ${lead.score_reasons}` : null,
  ];
  return lines.filter(Boolean).join('\n');
}


const SYSTEM = `Bạn là freelancer người Việt kiêm UI/UX designer và copywriter. Bạn tự thiết kế bản demo website cho từng doanh nghiệp nhỏ
và tự viết tin nhắn chào khách. Thiết kế phải giống người làm thật: tiết chế, có chủ đích, không lạm dụng gradient/đổ bóng/hiệu ứng,
không "giống AI". Chỉ trả lời bằng 1 object JSON hợp lệ.`;

/** Bước 1: lên kế hoạch site (trang nào, phong cách nào, section nào) + tin nhắn */
export function planMessages(lead, sender, maxPages) {
  const user = `THÔNG TIN KHÁCH:
${leadFacts(lead)}

NGƯỜI GỬI: ${sender.name} — ${sender.intro}.

VIỆC 1 — "message": tin nhắn Zalo gửi chủ "${lead.name}"
- 3 đến 5 câu, dưới 600 ký tự. Xưng "em", gọi "anh/chị". Mở đầu tự nhiên, KHÔNG "Kính gửi", "Xin chào Quý khách".
- Nhắc đúng 1 điểm cụ thể, có thật của shop lấy từ THÔNG TIN KHÁCH. Không bịa.
- Nói em đã làm thử bản demo giao diện cho shop (vài trang như trang chủ, đặt lịch...), gửi kèm ảnh để anh/chị xem.
- Kết bằng 1 câu hỏi mở nhẹ nhàng. Không ép mua, không nói giá. Tối đa 1 emoji. Không dùng cụm sáo rỗng ("giải pháp toàn diện", "nâng tầm", "bứt phá").
- Ký tên "${sender.name}" ở dòng cuối.

VIỆC 2 — thiết kế bộ demo cho ngành "${lead.industry}":
- Chọn 2 đến ${maxPages} MÀN HÌNH giúp chủ shop HÌNH DUNG ĐƯỢC TOÀN BỘ LUỒNG khách hàng của chính ngành này. Mỗi màn hình có "kind":
  · màn hình đầu: "page" = Trang chủ đầy đủ (navbar → hero → nội dung → footer), 5–10 section.
  · các màn hình sau: "section" = CHỈ phần nội dung đó cắt ra từ website (vd bảng giá, quy trình, đội ngũ, dự án, lịch khai giảng, menu), 1–3 section, KHÔNG navbar/hero/footer;
    hoặc "modal" = hộp thoại nổi trên trang (vd form đặt lịch/đặt bàn/yêu cầu báo giá), 1–2 section.
  Chọn màn hình nào là tuỳ ngành, sao cho chủ shop thấy được trải nghiệm khách hàng thật.
- Mỗi màn hình có "layout": 1–2 câu mô tả BỐ CỤC RIÊNG (lưới, vị trí ảnh, kiểu danh sách/bảng/thẻ, nhịp nền sáng–tối).
  Các màn hình phải có bố cục KHÁC NHAU rõ rệt (vd trang chủ: hero chia đôi ảnh phải + dải số liệu + bento dịch vụ;
  bảng giá: danh sách giá dạng bảng kẻ dòng 2 cột + khối ghi chú dính bên trái; modal: form 2 cột với nút chọn khung giờ).
- Chọn ĐÚNG 1 phong cách cho CẢ bộ demo (mọi màn hình dùng chung để đồng nhất), hợp với ngành và khách hàng của shop:
${styleDoc()}
- Section lấy từ thư viện sau. Chọn variant đa dạng, KHÔNG lặp một bố cục quá nhiều:
${componentDoc({ fields: false })}
- QUAN TRỌNG: ở bước này CHỈ ghi "type" và "variant" cho mỗi section. KHÔNG viết tiêu đề, nội dung, items, ảnh... (nội dung sẽ viết ở bước sau).
- Bộ màu thương hiệu (mã hex): primary (màu chính, đủ đậm để làm nền nút chữ trắng), accent (nhấn nhẹ), ink (màu chữ), surface (nền trang).
  Chọn màu hợp ngành và cảm xúc thương hiệu; ưu tiên phối màu tiết chế, có thể dùng nền kem/trắng ngà/xám ấm thay vì trắng tinh.
- Font (có hỗ trợ tiếng Việt): sans: ${FONTS.sans.join(', ')}; serif: ${FONTS.serif.join(', ')}.

Trả về JSON đúng khung:
{
  "message": "...",
  "brand": { "style": "tên phong cách", "logo_text": "tên ngắn gọn để làm logo", "illustration": "1 danh từ TIẾNG ANH tượng trưng cho doanh nghiệp (vd tooth, glasses, car, house, book)", "colors": { "primary": "#...", "accent": "#...", "ink": "#...", "surface": "#..." },
             "font_heading": "...", "font_body": "..." },
  "pages": [
    { "slug": "trang-chu", "title": "Trang chủ", "kind": "page", "purpose": "màn hình này giúp khách làm gì", "layout": "mô tả bố cục riêng",
      "sections": [ { "type": "navbar", "variant": "..." }, { "type": "hero", "variant": "..." }, ..., { "type": "footer", "variant": "..." } ] },
    { "slug": "bang-gia", "title": "Bảng giá", "kind": "section", "purpose": "...", "layout": "...", "sections": [ { "type": "pricing", "variant": "..." } ] },
    { "slug": "dat-lich", "title": "Đặt lịch", "kind": "modal", "purpose": "...", "layout": "...", "sections": [ { "type": "booking_form", "variant": "..." } ] }
  ]
}`;
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }];
}

/**
 * Tab "LLM tự thiết kế" — bước A: LLM TỰ QUYẾT bộ demo gồm những màn hình nào (độc lập với template generic).
 * Chỉ đưa thông tin shop + ngành; không đưa danh sách section/variant của thư viện.
 */
export function llmScreensMessages(lead, maxScreens) {
  const system = 'Bạn là UI/UX designer lên kế hoạch bộ demo website cho một doanh nghiệp nhỏ Việt Nam. Chỉ trả lời bằng 1 object JSON.';
  const user = `THÔNG TIN KHÁCH:
${leadFacts(lead)}

Hãy tự quyết bộ demo website cho doanh nghiệp ngành "${lead.industry}" này cần những MÀN HÌNH nào (tối đa ${maxScreens}),
để chủ shop xem ảnh chụp là hình dung được website và trải nghiệm khách hàng của chính ngành mình.
Mỗi màn hình có "kind":
- "page": một trang đầy đủ có header và footer,
- "section": chỉ một phần nội dung cắt ra từ website (không header/footer),
- "modal": hộp thoại nổi trên trang (vd form đặt lịch, chọn gói, giỏ hàng...).
Tự chọn số lượng, loại và nội dung từng màn hình sao cho hợp ngành nhất (không bắt buộc theo khuôn nào).
"brief": 1–2 câu mô tả màn hình đó trình bày gì và bố cục ra sao; các màn hình phải khác nhau rõ rệt về bố cục.

Trả về JSON: { "screens": [ { "slug": "...", "title": "tên màn hình tiếng Việt", "kind": "page|section|modal", "brief": "..." } ] }`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** Tab "LLM tự thiết kế" — bước B: viết HTML (Tailwind) cho 1 màn hình theo skill front-end */
export function htmlMessages(lead, brand, screen, screens, skill) {
  const c = brand.colors;
  const others = screens.filter((x) => x.slug !== screen.slug).map((x) => `- ${x.title} (${x.kind}): ${x.brief || ''}`).join('\n');
  const kindRule = {
    page: 'Dạng PAGE: trang đầy đủ, có header và footer.',
    section: 'Dạng SECTION: chỉ phần nội dung này (1–3 khối liền nhau), KHÔNG header, KHÔNG footer.',
    modal: 'Dạng MODAL: nền trang giả lập phía sau (đơn giản, mờ) + lớp phủ tối + hộp thoại ở giữa có data-section="modal", gọn trong khung 1440×900.',
  }[screen.kind] || '';
  const system = `${skill}

QUY TẮC ĐẦU RA (quan trọng nhất): trả lời NGAY bằng thẻ HTML đầu tiên (vd <header ...> hoặc <section ...>).
KHÔNG viết kế hoạch, phân tích, ghi chú, "Let me...", "Plan:", danh sách ý tưởng hay bất kỳ chữ nào trước/sau mã HTML.
Mọi chữ không nằm trong thẻ HTML đều làm hỏng bản demo.`;
  const user = `THÔNG TIN KHÁCH:
${leadFacts(lead)}

THƯƠNG HIỆU (dùng nhất quán):
- Tên hiển thị/logo: ${brand.logo_text || lead.name} · SĐT: ${lead.phone || '—'}${lead.address ? ` · Địa chỉ: ${lead.address}` : ''}
- Màu (đã cấu hình thành class): primary ${c.primary}, accent ${c.accent}, ink ${c.ink}, surface ${c.surface}
- Font tiêu đề: ${brand.font_heading} (class font-head) · Font thân bài: ${brand.font_body}

MÀN HÌNH CẦN THIẾT KẾ: "${screen.title}" — ${screen.brief || ''}
${kindRule}

Các màn hình khác trong bộ demo (nội dung khớp nhau, nhưng bố cục khác):
${others || 'không có'}

Bạn toàn quyền quyết định bố cục và các khối nội dung, đúng ngành "${lead.industry}". Viết nội dung tiếng Việt thật. Trả về HTML.`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** Bước 2: viết nội dung cho 1 trang theo kế hoạch */
export function pageMessages(lead, plan, page) {
  const outline = page.sections.map((s, i) => `${i + 1}. ${s.type} (variant: ${s.variant}) — trường: ${COMPONENTS[s.type].fields}`).join('\n');
  const others = plan.pages.filter((p) => p.slug !== page.slug).map((p) => p.title).join(', ');
  const user = `THÔNG TIN KHÁCH:
${leadFacts(lead)}

Bạn đang viết nội dung cho trang "${page.title}" (mục đích: ${page.purpose || '—'}; phong cách cả site: ${page.style}) trong bộ demo của "${lead.name}".
Các trang khác trong bộ demo: ${others || 'không có'}.

CÁC SECTION CẦN VIẾT (đúng thứ tự, đúng type và variant):
${outline}

QUY TẮC NỘI DUNG:
- Tiếng Việt tự nhiên, cụ thể đúng ngành "${lead.industry}" và đúng quy mô doanh nghiệp ${lead.area ? `ở ${lead.area}` : 'địa phương'}.
- KHÔNG ghi tên shop, SĐT, địa chỉ vào nội dung (hệ thống tự chèn). Không dùng HTML/markdown.
- Giá ghi kiểu Việt Nam ("450.000đ", "Từ 1,2 triệu"), hợp lý thị trường, là giá tham khảo. Số liệu thống kê khiêm tốn, hợp lý, không bịa thành tích lớn.
- Cảm nhận khách: tự nhiên, khác nhau, tên viết tắt kiểu "Chị Lan H.".
- "icon": tên icon Lucide dạng kebab-case (vd phone, calendar, clock, map-pin, shield-check, users, star, heart, sparkles, stethoscope, scissors, car, wrench, book-open, graduation-cap, hammer, ruler, camera, utensils, bed, leaf...).
- "image": { "query": từ khoá TIẾNG ANH 2–5 từ để tìm ảnh stock thật (vd "dentist examining patient", "modern dental clinic interior"), "alt": mô tả tiếng Việt }.
  Dùng ảnh ở những chỗ ảnh giúp hình dung (hero, about, gallery, team, image-cards...). Không cần ảnh cho mọi section.
- "illustration": 1 từ khoá TIẾNG ANH ngắn (1–2 từ, danh từ cụ thể, vd "tooth", "calendar", "car", "house") để chèn hình minh hoạ vector; chỉ dùng khi hợp (form đặt lịch, hero dạng illustration, cta).
- "booking_form.fields": tự thiết kế các trường phù hợp ngành (vd chọn dịch vụ với options thật, ngày, khung giờ với options như "08:00", "09:30"...).

Trả về JSON: { "sections": [ { "type": "...", "variant": "...", ...các trường của section đó... } ] }`;
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }];
}

export function judgeMessages(lead, message, demoSummary) {
  const system = 'Bạn là người kiểm duyệt chất lượng khắt khe, ghét văn mẫu AI và quảng cáo sáo rỗng. Trả lời bằng JSON.';
  const user = `Một kỹ sư web sắp tự tay gửi tin nhắn Zalo kèm ảnh demo website cho chủ doanh nghiệp sau:
${leadFacts(lead)}

TIN NHẮN (dòng cuối là chữ ký tên người gửi — đó là cách kết thúc bình thường, KHÔNG phải bị cắt cụt):
"""${message}"""

TÓM TẮT BỘ DEMO (nhiều trang):
${demoSummary}

Chấm 2 điểm từ 0 đến 100:
- human_score: tin nhắn có thẳng thắn, tự nhiên như người làm kỹ thuật nhắn trao đổi thật không (100 = hoàn toàn tự nhiên, đi thẳng vào vấn đề; trừ nặng nếu sáo rỗng, giọng sales mời chào, dài dòng, quá trang trọng, bịa số liệu, nhiều emoji).
- fit_score: trang demo có đúng thuật ngữ chuyên ngành, bảng giá sát thực tế TP.HCM và không bịa đặt số liệu ảo lố bịch không.
Liệt kê tối đa 3 vấn đề cụ thể nhất (tiếng Việt, ngắn gọn).

Trả về JSON: {"human_score": số, "fit_score": số, "issues": ["...", "..."]}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

// Mở rộng danh sách từ khóa phát hiện "văn mẫu AI / sales chợ"
export const CLICHES = [
  'kính gửi', 'quý khách', 'giải pháp toàn diện', 'nâng tầm', 'bứt phá', 'tối ưu trải nghiệm',
  'chuyên nghiệp hàng đầu', 'đột phá', 'hàng đầu việt nam', 'cam kết 100%', 'trân trọng cảm ơn',
  'xin chân thành', 'đồng hành cùng', 'thương hiệu của bạn', 'trong thời đại số',
  'chúc anh/chị', 'một ngày tốt lành', 'xin phép được', 'cơ hội hợp tác', 'tăng trưởng vượt bậc',
  'uy tín hàng đầu', 'dẫn đầu thị trường', 'chuyển đổi số'
];