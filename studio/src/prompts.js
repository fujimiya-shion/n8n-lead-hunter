import { FONTS } from './brand.js';
import { DIRECTIONS, directionText } from './directions.js';
import { VISUAL_STYLES, visualText } from './visualstyles.js';

export function leadFacts(lead) {
  const lines = [
    `Tên doanh nghiệp: ${lead.name}`,
    `Từ khoá ngành lúc tìm kiếm: ${lead.industry} (CHỈ là gợi ý, có thể sai)${lead.category ? ` · Loại hình trên Google: ${lead.category}` : ''}`,
    'NGHIỆP VỤ THẬT: tự suy ra doanh nghiệp này làm gì từ TÊN + loại hình Google; nếu từ khoá ngành mâu thuẫn với tên thì theo TÊN (vd tên "Nha khoa X" mà từ khoá là "spa" thì đây là phòng khám nha khoa).',
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


const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/**
 * Bước lên kế hoạch (1 lời gọi): tin nhắn Zalo + thương hiệu (hướng nghệ thuật, màu, font) + danh sách màn hình kèm brief.
 * oldSite: bản phân tích website cũ (nếu web còn sống) → bộ demo là bản "làm mới" web cũ.
 */
export function planMessages(lead, sender, maxScreens, recent = '', { oldSite = null } = {}) {
  const system = `Bạn là freelancer người Việt kiêm UI/UX designer và copywriter. Bạn lên kế hoạch bản demo website cho một doanh nghiệp nhỏ
và viết tin nhắn chào khách. Thiết kế có chủ đích, đúng cá tính của doanh nghiệp và khách hàng của họ, không "giống AI". Chỉ trả lời bằng 1 object JSON hợp lệ.`;
  const user = `THÔNG TIN KHÁCH:
${leadFacts(lead)}
${oldSite ? `
WEBSITE HIỆN TẠI CỦA KHÁCH — bộ demo là bản LÀM MỚI website này (đã phân tích từ HTML thật):
${oldSite.brief}
` : ''}
NGƯỜI GỬI: ${sender.name} — ${sender.intro}.

VIỆC 1 — "message": tin nhắn Zalo gửi chủ "${lead.name}"
- 3 đến 5 câu, dưới 600 ký tự. Xưng "em", gọi "anh/chị". Mở đầu tự nhiên, KHÔNG "Kính gửi", "Xin chào Quý khách".
- Nhắc đúng 1 điểm cụ thể, có thật của shop lấy từ THÔNG TIN KHÁCH. Không bịa.
- ${oldSite ? 'Nói em đã làm thử bản LÀM MỚI giao diện cho website hiện tại (giữ nội dung, làm lại giao diện), gửi kèm ảnh để anh/chị xem. Được nhắc nhẹ 1 điểm yếu cụ thể của web cũ, không chê bai.' : 'Nói em đã làm thử bản demo giao diện cho shop (vài màn hình), gửi kèm ảnh để anh/chị xem.'}
- Kết bằng 1 câu hỏi mở nhẹ nhàng. Không ép mua, không nói giá. Tối đa 1 emoji. Không dùng cụm sáo rỗng ("giải pháp toàn diện", "nâng tầm", "bứt phá").
- Ký tên "${sender.name}" ở dòng cuối.
- CHỈ viết tiếng Việt có dấu: tuyệt đối không chèn chữ Hán/Trung, chữ Nhật, chữ Hàn hay câu tiếng Anh.

VIỆC 2 — "brand": nhận diện cho bộ demo, hợp với nghiệp vụ thật (xem NGHIỆP VỤ THẬT) và KHÁCH HÀNG của doanh nghiệp:
- "style": PHONG CÁCH THỊ GIÁC (cảm xúc, màu, font, hình khối, hoạ tiết). Hỏi: khách của doanh nghiệp này là ai, họ cần cảm thấy gì khi vào web?
  (vd trường mầm non → vui tươi rực rỡ; công ty B2B → hiện đại chuyên nghiệp; phòng khám → sạch sẽ đáng tin; tiệm vàng/spa cao cấp → sang trọng).
  KHÔNG mặc định "minimal" — chỉ chọn minimal khi doanh nghiệp thật sự hợp tối giản. Chọn 1 trong:
${shuffle(Object.entries(VISUAL_STYLES)).map(([k, v]) => `  · ${k} — ${v.name} (hợp với: ${v.fits})`).join('\n')}
- "direction": HƯỚNG NGHỆ THUẬT = ngôn ngữ BỐ CỤC chung cho cả bộ demo (khác với style). Chọn 1 hướng hợp với nội dung và style đã chọn (danh sách không theo thứ tự ưu tiên):
${shuffle(Object.entries(DIRECTIONS)).map(([k, d]) => `  · ${k} — ${d.name}: ${d.desc}`).join('\n')}
- "colors" (mã hex): primary (màu chính, đủ đậm để làm nền nút chữ trắng), accent (nhấn), secondary và highlight (2 màu phụ — phong cách nhiều màu như vui tươi thì cho rực rỡ, phong cách tối giản thì để gần accent), ink (màu chữ), surface (nền trang).
  ${oldSite?.colors?.length ? `WEBSITE CŨ ĐANG DÙNG CÁC MÀU: ${oldSite.colors.join(', ')}${oldSite.primary ? ` (màu thương hiệu chính: ${oldSite.primary})` : ''}.
  → BẮT BUỘC giữ đúng bộ màu này (primary = màu thương hiệu chính của web cũ; accent/secondary lấy từ các màu còn lại nếu hợp) để khách nhận ra thương hiệu của mình; chỉ chỉnh độ đậm/nhạt khi cần cho dễ đọc. Style chọn sao cho hợp với bộ màu và nghiệp vụ.`
    : 'Chọn theo style và cá tính riêng của doanh nghiệp (không mặc định xanh than/nền kem).'}
- Font (có tiếng Việt). Chọn theo style; tiêu đề có thể lấy ở mọi nhóm, thân bài chỉ lấy ở nhóm "không chân" hoặc "có chân":
  · không chân: ${shuffle([...FONTS.sans]).join(', ')}
  · có chân: ${shuffle([...FONTS.serif]).join(', ')}
  · tròn/vui: ${FONTS.rounded.join(', ')}
  · đứng hẹp, mạnh: ${FONTS.condensed.join(', ')}
  · viết tay (chỉ cho tiêu đề ngắn): ${FONTS.script.join(', ')}
  · đơn cách (mã sản phẩm, thông số; không dùng cho thân bài): ${FONTS.mono.join(', ')}
${recent ? `- CÁC DEMO GẦN ĐÂY (chỉ để tránh trùng bố cục/font khi có lựa chọn tương đương; style và màu vẫn ưu tiên đúng doanh nghiệp${oldSite?.colors?.length ? ' và web cũ' : ''}): ${recent}\n` : ''}
VIỆC 3 — "screens": các MÀN HÌNH của bộ demo (1 đến ${maxScreens}) để chủ shop xem ảnh là hình dung được website và trải nghiệm khách hàng của chính ngành mình.
- Màn hình đầu BẮT BUỘC là Trang chủ đầy đủ, "kind": "page" (header → các khối → footer).
- Các màn hình sau: "section" (một phần nội dung cắt ra, không header/footer — vd dự án, bảng giá, ước tính chi phí) hoặc "modal" (hộp thoại nổi — vd form đặt lịch, chọn gói).
- Nghĩ xem khách của ngành này thật sự cần làm gì trên website (vd xây dựng: xem dự án, ước tính chi phí; nhà hàng: thực đơn, đặt bàn…). Không theo khuôn có sẵn nào.${oldSite ? `
- Bản làm mới: trang chủ giữ các nội dung chính của trang chủ cũ (được sắp xếp lại hợp lý hơn); màn hình sau ưu tiên các trang/mục CÓ THẬT trên web cũ (theo menu).` : ''}
- "brief": 2–4 câu CHỈ nói màn hình giúp khách làm gì và cần nội dung gì (vd: "khách muốn biết chi phí trước khi gọi → cần đơn giá theo hạng mục và cách tính").
  KHÔNG mô tả bố cục, thứ tự khối, kiểu hero, lưới, màu, font (designer quyết ở bước sau).
  Chỉ đòi thông tin có trong THÔNG TIN KHÁCH${oldSite ? ' / WEBSITE HIỆN TẠI' : ''}; thông tin chưa có (giờ mở cửa, năm thành lập, số khách, bảng giá chính thức…) thì ghi "chưa có, để dạng cập nhật sau" hoặc bỏ qua.

Trả về JSON đúng khung:
{
  "message": "...",
  "brand": { "style": "khoá phong cách thị giác", "direction": "khoá hướng nghệ thuật", "logo_text": "tên ngắn gọn để làm logo", "illustration": "1 danh từ TIẾNG ANH tượng trưng cho doanh nghiệp (vd tooth, glasses, car, house, book)",
             "colors": { "primary": "#...", "accent": "#...", "secondary": "#...", "highlight": "#...", "ink": "#...", "surface": "#..." }, "font_heading": "...", "font_body": "..." },
  "screens": [ { "slug": "trang-chu", "title": "tên màn hình tiếng Việt", "kind": "page|section|modal", "brief": "..." } ]
}`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export const HTML_RULE = `QUY TẮC ĐẦU RA (quan trọng nhất): trả lời NGAY bằng thẻ HTML đầu tiên (vd <header ...> hoặc <section ...>).
KHÔNG viết kế hoạch, phân tích, ghi chú, "Let me...", "Plan:", danh sách ý tưởng hay bất kỳ chữ nào trước/sau mã HTML.
Mọi chữ không nằm trong thẻ HTML đều làm hỏng bản demo.`;

/** Ghép prompt đã lưu ({system, user}, system không gồm skill) với file skill MỚI NHẤT thành messages gửi LLM */
export function withSkill(skill, prompt) {
  return [{ role: 'system', content: `${skill}\n\n${prompt.system}` }, { role: 'user', content: prompt.user }];
}

/** Phần prompt HTML có thể lưu/chỉnh trên trang 8082: system = quy tắc đầu ra (skill được ghép riêng), user = đề bài */
export function htmlPrompt(lead, brand, screen, screens, { hasShopPhoto = false, recent = '', oldSite = null } = {}) {
  const c = brand.colors;
  const others = screens.filter((x) => x.slug !== screen.slug).map((x) => `- ${x.title} (${x.kind}): ${x.brief || ''}`).join('\n');
  const kindRule = {
    page: 'Dạng PAGE: trang đầy đủ, mở đầu bằng <header data-section="header"> và kết thúc bằng <footer data-section="footer">. Phần giữa (số khối, loại khối, thứ tự, cách mở đầu trang) do bạn tự thiết kế; mỗi khối lớn có data-section. Viết TRỌN trang, không dừng giữa chừng.',
    section: 'Dạng SECTION: chỉ phần nội dung này (1–3 khối liền nhau), KHÔNG header, KHÔNG footer.',
    modal: 'Dạng MODAL: nền trang giả lập phía sau (đơn giản, mờ) + lớp phủ tối + hộp thoại ở giữa có data-section="modal", gọn trong khung 1440×900.',
  }[screen.kind] || '';
  const user = `THÔNG TIN KHÁCH:
${leadFacts(lead)}

${brand.style ? `PHONG CÁCH THỊ GIÁC CỦA CẢ BỘ DEMO — ${visualText(brand.style)}
→ Phong cách này QUYẾT ĐỊNH màu nền các khối, độ bo, bóng đổ, gradient, hoạ tiết và cách xử lý ảnh; nó GHI ĐÈ các mặc định "tối giản" trong hướng dẫn thiết kế (mục 2.3, 2.4, 6) khi khác nhau. Trang phải nhìn là nhận ra ngay cảm xúc này.

` : ''}${brand.direction ? `HƯỚNG NGHỆ THUẬT CỦA CẢ BỘ DEMO — ${directionText(brand.direction)}
→ Mọi khối (mở đầu trang, danh sách dịch vụ/giá, quy trình, đánh giá, lời mời liên hệ, footer) phải thể hiện ngôn ngữ bố cục này, KHÔNG quay về bố cục landing page mặc định (hero chia đôi + dải 3 chỉ số, tiêu đề trái/danh sách phải, 4 bước ngang, dải CTA bo góc, footer 4 cột).

` : ''}THƯƠNG HIỆU (dùng nhất quán):
- Tên hiển thị/logo: ${brand.logo_text || lead.name} · SĐT: ${lead.phone || '—'}${lead.address ? ` · Địa chỉ: ${lead.address}` : ''}
- Màu (đã cấu hình thành class Tailwind): primary ${c.primary}, accent ${c.accent}, secondary ${c.secondary || c.accent}, highlight ${c.highlight || c.accent}, ink ${c.ink}, surface ${c.surface} (vd bg-secondary, text-highlight, bg-highlight/20, border-secondary)
- Font tiêu đề: ${brand.font_heading} (class font-head) · Font thân bài: ${brand.font_body}

MÀN HÌNH CẦN THIẾT KẾ: "${screen.title}"
Mục đích & nội dung cần có: ${screen.brief || '—'}
${kindRule}

Các màn hình khác trong bộ demo (để nội dung khớp nhau; bố cục mỗi màn hình tự thiết kế riêng):
${others || 'không có'}

${hasShopPhoto ? `ẢNH THẬT CỦA SHOP: có 1 ảnh chụp thật của shop. Đặt nó ở một vị trí nổi bật do bạn chọn bằng thẻ <img data-shop-photo alt="..." class="..."> (chỉ 1 lần trong màn hình này; ảnh có thể chất lượng vừa phải nên dùng object-cover, khung vừa phải). Các ảnh khác vẫn dùng <img data-query="từ khoá tiếng Anh">.\n\n` : ''}${oldSite ? `WEBSITE CŨ CỦA KHÁCH — đây là bản LÀM MỚI (đã phân tích từ HTML thật):
${oldSite.briefWithPhotos}
Cách làm mới: giữ cấu trúc thông tin và NỘI DUNG THẬT của web cũ (tên dịch vụ, giá, giờ, địa chỉ, cam kết… dùng nguyên văn, sửa lỗi chính tả nếu có),
nhưng thiết kế lại hoàn toàn cho hiện đại, rõ ràng, dễ dùng trên điện thoại và khắc phục các điểm yếu đã nêu. Được sắp xếp lại thứ tự khối nếu hợp lý hơn;
KHÔNG sao chép giao diện cũ. Ảnh thật từ web cũ ưu tiên hơn ảnh stock.\n\n` : ''}${recent && screen.kind === 'page' && !oldSite ? `${recent}\n\n` : ''}KHÔNG bịa số liệu về doanh nghiệp (số năm hoạt động, số công trình, số khách, GIỜ MỞ CỬA...) nếu THÔNG TIN KHÁCH${oldSite ? ' và WEBSITE CŨ' : ''} không có (giờ mở cửa chưa biết thì ghi "Giờ làm việc: cập nhật sau" hoặc bỏ qua) — dùng nội dung định tính hoặc số đánh giá Google thật. ĐÁNH GIÁ / REVIEW CỦA KHÁCH (nếu màn hình có khối này): KHÔNG bịa lời khách. Nội dung trích dẫn dùng chữ giữ chỗ Lorem ipsum (1–2 câu), tên người dạng "Khách hàng A/B/C"; điểm sao và số lượt đánh giá Google thật thì được dùng (vẽ sao bằng <i data-lucide="star" class="h-4 w-4 fill-current text-accent">, đủ số sao theo điểm). Đặt ngay dưới tiêu đề khối 1 dòng ghi chú chữ nhỏ, màu nhạt: "Nội dung đánh giá minh hoạ — khi làm website thật em sẽ đưa đánh giá thật của khách lên, anh/chị xem qua giao diện là được ạ."
KHÔNG viết câu khẳng định ảnh là "ảnh thật / ảnh chụp tại công trình của shop" (ảnh minh hoạ là ảnh stock).\n\nBạn toàn quyền quyết định bố cục và các khối nội dung, đúng nghiệp vụ thật của doanh nghiệp (xem NGHIỆP VỤ THẬT). Viết nội dung tiếng Việt thật. Trả về HTML.`;
  return { system: HTML_RULE, user };
}

export function judgeMessages(lead, message, demoSummary, { oldSite = null } = {}) {
  const system = 'Bạn là người kiểm duyệt chất lượng khắt khe, ghét văn mẫu AI và quảng cáo sáo rỗng. Trả lời bằng JSON.';
  const user = `Một kỹ sư web sắp tự tay gửi tin nhắn Zalo kèm ảnh demo website cho chủ doanh nghiệp sau:
${leadFacts(lead)}

TIN NHẮN (dòng cuối là chữ ký tên người gửi — đó là cách kết thúc bình thường, KHÔNG phải bị cắt cụt):
"""${message}"""

${oldSite ? `Bộ demo là bản LÀM MỚI website hiện tại của khách. Nội dung thật lấy từ web cũ (được dùng, KHÔNG tính là bịa):\n${oldSite.brief}\n\n` : ''}TÓM TẮT BỘ DEMO (nhiều trang):
${demoSummary}

Chấm 2 điểm từ 0 đến 100:
- human_score: tin nhắn có thẳng thắn, tự nhiên như người làm kỹ thuật nhắn trao đổi thật không (100 = hoàn toàn tự nhiên, đi thẳng vào vấn đề; trừ nặng nếu sáo rỗng, giọng sales mời chào, dài dòng, quá trang trọng, bịa số liệu, nhiều emoji).
- fit_score: trang demo có đúng nghiệp vụ thật của doanh nghiệp (suy từ tên), đúng thuật ngữ chuyên ngành, bảng giá sát thực tế TP.HCM và không bịa đặt số liệu ảo lố bịch không.
LƯU Ý: khối đánh giá khách dùng Lorem ipsum + ghi chú "đánh giá minh hoạ" là CỐ Ý (sẽ thay bằng review thật khi làm web thật) — KHÔNG tính là lỗi.
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