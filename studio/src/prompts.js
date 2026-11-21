import { componentDoc, COMPONENTS } from './spec.js';
import { FONTS, STYLES } from './styles.js';
import { DIRECTIONS, directionText } from './directions.js';

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


const SYSTEM = `Bạn là freelancer người Việt kiêm UI/UX designer và copywriter. Bạn tự thiết kế bản demo website cho từng doanh nghiệp nhỏ
và tự viết tin nhắn chào khách. Thiết kế phải giống người làm thật: tiết chế, có chủ đích, không lạm dụng gradient/đổ bóng/hiệu ứng,
không "giống AI". Chỉ trả lời bằng 1 object JSON hợp lệ.`;

/** Bước 1: lên kế hoạch site (trang nào, phong cách nào, section nào) + tin nhắn */
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// withPages = true chỉ khi cần tab generic (template thư viện): khi đó mới gửi danh sách section/variant (~5k ký tự)
export function planMessages(lead, sender, maxPages, recent = '', { withPages = false, oldSite = null } = {}) {
  const pagesTask = withPages ? `
VIỆC 3 — danh sách màn hình cho bộ template (dựng từ thư viện section có sẵn):
- 2 đến ${maxPages} màn hình theo đúng nghiệp vụ thật. Màn hình đầu "kind": "page" = Trang chủ đầy đủ (navbar → … → footer), 5–10 section.
  Các màn hình sau: "section" (1–3 section cắt ra từ website, KHÔNG navbar/hero/footer) hoặc "modal" (hộp thoại nổi, 1–2 section).
- Section lấy từ thư viện sau, tự chọn variant và thứ tự:
${componentDoc({ fields: false })}
- CHỈ ghi "type" và "variant" cho mỗi section, KHÔNG viết nội dung (nội dung viết ở bước sau).
` : '';
  const pagesShape = withPages ? `,
  "pages": [ { "slug": "trang-chu", "title": "Trang chủ", "kind": "page", "purpose": "màn hình này giúp khách làm gì",
               "sections": [ { "type": "navbar", "variant": "..." }, ..., { "type": "footer", "variant": "..." } ] },
             { "slug": "...", "title": "...", "kind": "section|modal", "purpose": "...", "sections": [ { "type": "...", "variant": "..." } ] } ]` : '';
  const user = `THÔNG TIN KHÁCH:
${leadFacts(lead)}

${oldSite ? `WEBSITE HIỆN TẠI CỦA KHÁCH (đã phân tích từ HTML thật):\n${oldSite.brief}\n\n` : ''}NGƯỜI GỬI: ${sender.name} — ${sender.intro}.

VIỆC 1 — "message": tin nhắn Zalo gửi chủ "${lead.name}"
- 3 đến 5 câu, dưới 600 ký tự. Xưng "em", gọi "anh/chị". Mở đầu tự nhiên, KHÔNG "Kính gửi", "Xin chào Quý khách".
- Nhắc đúng 1 điểm cụ thể, có thật của shop lấy từ THÔNG TIN KHÁCH. Không bịa.
${oldSite ? '- Nói em đã làm thử bản LÀM MỚI giao diện cho website hiện tại của shop (giữ nội dung, làm lại giao diện), gửi kèm ảnh để anh/chị xem. Được nhắc 1 điểm yếu cụ thể của web cũ (lấy từ phần phân tích), nói nhẹ nhàng, không chê bai.' : '- Nói em đã làm thử bản demo giao diện cho shop (vài màn hình), gửi kèm ảnh để anh/chị xem.'}
- Kết bằng 1 câu hỏi mở nhẹ nhàng. Không ép mua, không nói giá. Tối đa 1 emoji. Không dùng cụm sáo rỗng ("giải pháp toàn diện", "nâng tầm", "bứt phá").
- Ký tên "${sender.name}" ở dòng cuối.

VIỆC 2 — "brand": nhận diện thương hiệu cho bộ demo, hợp với nghiệp vụ thật (xem NGHIỆP VỤ THẬT) và khách hàng của doanh nghiệp:
- "style": chọn 1 trong: ${Object.keys(STYLES).join(', ')}.
- "direction": HƯỚNG NGHỆ THUẬT = ngôn ngữ bố cục chung cho cả bộ demo. Chọn 1 hướng hợp nhất với doanh nghiệp, khách hàng và nội dung của họ (danh sách không theo thứ tự ưu tiên):
${shuffle(Object.entries(DIRECTIONS)).map(([k, d]) => `  · ${k} — ${d.name}: ${d.desc}`).join('\n')}
- Bộ màu (mã hex): primary (màu chính, đủ đậm để làm nền nút chữ trắng), accent (nhấn nhẹ), ink (màu chữ), surface (nền trang).
  Chọn theo cá tính riêng của doanh nghiệp này (không mặc định xanh than/nền kem).
- Font (có hỗ trợ tiếng Việt, không có font mặc định): ${shuffle([...FONTS.sans, ...FONTS.serif]).join(', ')}.
${oldSite?.primary ? `- Web cũ dùng màu thương hiệu ${oldSite.primary}: GIỮ màu này (hoặc bản đậm/nhạt hơn chút) làm primary để khách nhận ra thương hiệu; font và phong cách thì làm mới.\n` : ''}${recent ? `- THƯƠNG HIỆU CÁC DEMO GẦN ĐÂY (tránh trùng${oldSite?.primary ? ', trừ màu thương hiệu web cũ' : ''}): ${recent}\n` : ''}${pagesTask}
Trả về JSON đúng khung:
{
  "message": "...",
  "brand": { "style": "...", "direction": "khoá hướng nghệ thuật", "logo_text": "tên ngắn gọn để làm logo", "illustration": "1 danh từ TIẾNG ANH tượng trưng cho doanh nghiệp (vd tooth, glasses, car, house, book)",
             "colors": { "primary": "#...", "accent": "#...", "ink": "#...", "surface": "#..." }, "font_heading": "...", "font_body": "..." }${pagesShape}
}`;
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }];
}

/**
 * Tab "LLM tự thiết kế" — bước A: LLM TỰ QUYẾT bộ demo gồm những màn hình nào (độc lập với template generic).
 * Chỉ đưa thông tin shop + ngành; không đưa danh sách section/variant của thư viện.
 */
export function llmScreensMessages(lead, maxScreens, { oldSite = null } = {}) {
  const system = 'Bạn là UI/UX designer lên kế hoạch bộ demo website cho một doanh nghiệp nhỏ Việt Nam. Chỉ trả lời bằng 1 object JSON.';
  const user = `THÔNG TIN KHÁCH:
${leadFacts(lead)}

Hãy tự quyết bộ demo website cho doanh nghiệp này (theo nghiệp vụ thật, xem ở trên) cần những MÀN HÌNH nào (tối đa ${maxScreens}),
để chủ shop xem ảnh chụp là hình dung được website và trải nghiệm khách hàng của chính ngành mình.
Mỗi màn hình có "kind":
- "page": CHỈ màn hình đầu tiên, và nó BẮT BUỘC là Trang chủ đầy đủ (header → hero → các khối → footer),
- "section": chỉ một phần nội dung cắt ra từ website (không header/footer) — dùng cho các màn hình sau (dự án, bảng giá, ước tính chi phí...),
- "modal": hộp thoại nổi trên trang (vd form đặt lịch, chọn gói, giỏ hàng...).
Tự chọn số lượng (1–${maxScreens}), loại và nội dung từng màn hình sao cho hợp ngành nhất: nghĩ xem khách của ngành này
thật sự cần làm gì trên website (vd xây dựng: xem dự án, ước tính chi phí, quy trình thanh toán theo đợt; nhà hàng: thực đơn, đặt bàn...).
Không theo khuôn có sẵn nào.
${oldSite ? `
ĐÂY LÀ BẢN LÀM MỚI WEBSITE ĐANG CÓ (đã phân tích từ HTML thật):
${oldSite.brief}
→ Màn hình đầu: trang chủ làm mới, giữ các nội dung chính của trang chủ cũ (có thể sắp xếp lại cho hợp lý hơn).
→ Các màn hình sau: ưu tiên các trang/mục quan trọng CÓ THẬT trên web cũ (theo menu), làm lại cho rõ ràng, dễ dùng hơn.
→ Brief dùng nội dung thật của web cũ; thông tin web cũ có (giờ làm việc, giá, dịch vụ…) là thông tin thật, được đưa vào.
` : ''}"brief": 2–4 câu CHỈ nói màn hình này giúp khách làm gì và cần những thông tin/nội dung gì (vd: "khách muốn biết chi phí trước khi gọi → cần đơn giá theo hạng mục và cách tính").
KHÔNG mô tả bố cục, thứ tự khối, kiểu hero, lưới, màu, font — phần thiết kế giao diện sẽ do designer quyết ở bước sau.
Brief CHỈ được đòi thông tin có trong THÔNG TIN KHÁCH. Thông tin chưa có (giờ mở cửa, năm thành lập, số khách, tên nhân sự, bảng giá chính thức…)
thì KHÔNG yêu cầu hiển thị như thật — ghi rõ "chưa có, để dạng cập nhật sau" hoặc bỏ qua.

Trả về JSON: { "screens": [ { "slug": "...", "title": "tên màn hình tiếng Việt", "kind": "page|section|modal", "brief": "..." } ] }`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export const HTML_RULE = `QUY TẮC ĐẦU RA (quan trọng nhất): trả lời NGAY bằng thẻ HTML đầu tiên (vd <header ...> hoặc <section ...>).
KHÔNG viết kế hoạch, phân tích, ghi chú, "Let me...", "Plan:", danh sách ý tưởng hay bất kỳ chữ nào trước/sau mã HTML.
Mọi chữ không nằm trong thẻ HTML đều làm hỏng bản demo.`;

/** Ghép prompt đã lưu ({system, user}, system không gồm skill) với file skill MỚI NHẤT thành messages gửi LLM */
export function withSkill(skill, prompt) {
  return [{ role: 'system', content: `${skill}\n\n${prompt.system}` }, { role: 'user', content: prompt.user }];
}

/** Tab "LLM tự thiết kế" — bước B: viết HTML (Tailwind) cho 1 màn hình theo skill front-end */
export function htmlMessages(lead, brand, screen, screens, skill, opts = {}) {
  return withSkill(skill, htmlPrompt(lead, brand, screen, screens, opts));
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

${brand.direction ? `HƯỚNG NGHỆ THUẬT CỦA CẢ BỘ DEMO — ${directionText(brand.direction)}
→ Mọi khối (mở đầu trang, danh sách dịch vụ/giá, quy trình, đánh giá, lời mời liên hệ, footer) phải thể hiện ngôn ngữ bố cục này, KHÔNG quay về bố cục landing page mặc định (hero chia đôi + dải 3 chỉ số, tiêu đề trái/danh sách phải, 4 bước ngang, dải CTA bo góc, footer 4 cột).

` : ''}THƯƠNG HIỆU (dùng nhất quán):
- Tên hiển thị/logo: ${brand.logo_text || lead.name} · SĐT: ${lead.phone || '—'}${lead.address ? ` · Địa chỉ: ${lead.address}` : ''}
- Màu (đã cấu hình thành class): primary ${c.primary}, accent ${c.accent}, ink ${c.ink}, surface ${c.surface}
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
- Tiếng Việt tự nhiên, cụ thể đúng nghiệp vụ thật của doanh nghiệp (xem NGHIỆP VỤ THẬT) và đúng quy mô doanh nghiệp ${lead.area ? `ở ${lead.area}` : 'địa phương'}.
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