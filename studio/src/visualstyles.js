// "Phong cách thị giác" = cảm xúc / tông của bộ demo (màu, font, độ bo, bóng, hoạ tiết, xử lý ảnh).
// Tách riêng với "hướng nghệ thuật" (directions.js = ngôn ngữ BỐ CỤC).
// LLM tự chọn theo khách hàng thật của doanh nghiệp (KHÔNG có bảng ngành → phong cách cố định trong code);
// "hợp với" chỉ là gợi ý để LLM hiểu tinh thần của từng phong cách.
export const VISUAL_STYLES = {
  playful: {
    name: 'Vui tươi, rực rỡ',
    fits: 'trẻ em, mầm non, đồ chơi, tiệc sinh nhật, trà sữa/ăn vặt, thú cưng — khách là gia đình, trẻ nhỏ, người trẻ',
    palette: 'nhiều màu tươi bão hoà (primary + secondary + highlight đều rực: vàng, cam, hồng, xanh ngọc, tím), nền sáng ấm hoặc pastel; các khối đổi màu nền liên tục',
    type: 'tiêu đề font tròn/vui (Baloo 2, Grandstander, Mali, Comfortaa, Itim, Patrick Hand), cỡ lớn, đậm; thân bài Nunito/Quicksand',
    shape: 'bo góc rất lớn (rounded-3xl, rounded-full), thẻ hơi nghiêng (rotate-1/-rotate-2), viền dày 2–3px màu ink',
    depth: 'bóng đổ đặc kiểu sticker (shadow-[6px_6px_0_0_var(--ink)]) hoặc bóng mềm; được dùng gradient tươi',
    decor: 'hình khối trang trí (tròn, sao, sóng, chấm bi) bằng div/SVG nội tuyến, đường chia khối dạng sóng, nhãn dán (sticker) chữ nghiêng',
    imagery: 'ảnh vui, khung ảnh bo tròn/hình blob, hình minh hoạ màu',
  },
  corporate: {
    name: 'Hiện đại chuyên nghiệp',
    fits: 'công ty B2B, xây dựng, sản xuất, logistics, luật, kế toán, công nghiệp — khách là doanh nghiệp, chủ đầu tư',
    palette: 'xanh đậm/navy/than chì làm chủ đạo + 1 màu nhấn mạnh (cam, vàng, xanh điện); nền trắng xen khối tối',
    type: 'Plus Jakarta Sans, Manrope, Inter, Archivo, Montserrat; tiêu đề đậm, chữ hoa nhỏ cho nhãn, số liệu lớn tabular',
    shape: 'góc vuông hoặc bo nhỏ (rounded-md), lưới chặt, đường kẻ phân cột',
    depth: 'bóng nhẹ có lớp, gradient tối tinh tế trên khối hero/CTA, lớp phủ ảnh tối',
    decor: 'đường kẻ lưới mờ, số thứ tự lớn, logo đối tác dạng chữ, dải số liệu',
    imagery: 'ảnh công trình/nhà máy/đội ngũ góc rộng, phủ tối có chữ trắng',
  },
  clinical: {
    name: 'Sạch sẽ, đáng tin (y tế)',
    fits: 'phòng khám, nha khoa, vật lý trị liệu, nhà thuốc, xét nghiệm — khách là bệnh nhân cần yên tâm',
    palette: 'trắng + xanh ngọc/xanh dương dịu làm chủ đạo, 1 màu nhấn ấm nhẹ cho nút; nền khối xanh rất nhạt',
    type: 'Lexend, Be Vietnam Pro, Nunito, Plus Jakarta Sans — dễ đọc, thân thiện, cỡ chữ thân bài lớn',
    shape: 'bo vừa–lớn (rounded-2xl), thẻ thoáng, icon trong nền tròn nhạt',
    depth: 'bóng mềm rất nhẹ, không gradient gắt',
    decor: 'icon đường nét y khoa, huy hiệu tin cậy (chứng chỉ, bác sĩ, thiết bị), khối giờ khám nổi bật',
    imagery: 'ảnh sáng, sạch, người thật đang được chăm sóc',
  },
  elegant: {
    name: 'Sang trọng, tinh tế',
    fits: 'spa cao cấp, thẩm mỹ, trang sức/tiệm vàng, khách sạn, nội thất cao cấp, váy cưới — khách chi tiêu cao',
    palette: 'nền kem/ngà hoặc đen than, màu nhấn ánh kim (vàng đồng, champagne) hoặc rượu vang; rất ít màu',
    type: 'tiêu đề serif thanh (Cormorant Garamond, Prata, Playfair Display), chữ giãn rộng (tracking-[0.2em]) cho nhãn; thân bài Josefin Sans/Lora',
    shape: 'góc vuông hoặc vòm (rounded-t-full cho khung ảnh), viền mảnh màu nhấn',
    depth: 'không bóng; tạo chiều sâu bằng ảnh và khoảng trắng',
    decor: 'đường kẻ mảnh, hoạ tiết nhỏ tinh tế, chữ ký/script nhỏ (Dancing Script) làm điểm nhấn',
    imagery: 'ảnh cận cảnh chất liệu, ánh sáng dịu, khung ảnh cao',
  },
  bold: {
    name: 'Mạnh mẽ, năng lượng',
    fits: 'gym, võ, thể thao, gara/ô tô/xe máy, sửa chữa, kỹ thuật, dạy lái xe — khách thích hành động, tốc độ',
    palette: 'đen/than + 1 màu rất gắt (đỏ, vàng chanh, cam neon); tương phản cực mạnh',
    type: 'tiêu đề chữ đứng hẹp in HOA (Anton, Oswald, Barlow Condensed, Saira Condensed, Chakra Petch), cỡ rất lớn; thân bài Barlow/Inter',
    shape: 'góc vuông, đường chéo (clip-path xiên), khối cắt chéo',
    depth: 'không bóng mềm; dùng khối màu đặc, sọc chéo, chữ viền (text-stroke)',
    decor: 'sọc cảnh báo, số lớn, chữ chạy ngang, mũi tên',
    imagery: 'ảnh hành động, tương phản cao, có thể đen trắng + màu nhấn',
  },
  warm: {
    name: 'Ấm áp, thủ công',
    fits: 'quán cà phê, nhà hàng, tiệm bánh, đồ handmade, nông sản, homestay — khách tìm cảm giác gần gũi',
    palette: 'tông đất ấm (nâu, cam đất, kem, xanh rêu), nền giấy kem',
    type: 'tiêu đề serif mềm hoặc viết tay (Lora, Prata, Lobster/Pacifico cho điểm nhấn), thân bài Nunito/Be Vietnam Pro',
    shape: 'bo vừa, mép không đều (hình blob), tem/nhãn tròn',
    depth: 'bóng ấm mềm, lớp giấy chồng nhau',
    decor: 'hoạ tiết vẽ tay, đường chấm, tem "since", menu viền chấm dẫn tới giá',
    imagery: 'ảnh đồ ăn/sản phẩm ánh sáng ấm, cận cảnh',
  },
  fresh: {
    name: 'Tươi mát, tự nhiên',
    fits: 'thực phẩm sạch, cây cảnh, dịch vụ vệ sinh, giặt là, nước uống, sức khoẻ tự nhiên',
    palette: 'xanh lá tươi/xanh mint + vàng chanh hoặc san hô, nền trắng xen xanh rất nhạt',
    type: 'Quicksand, Nunito, Plus Jakarta Sans, Comfortaa cho tiêu đề',
    shape: 'bo lớn, hình lá/blob, khối tròn',
    depth: 'bóng mềm nhẹ, gradient nhẹ xanh–vàng được phép',
    decor: 'lá, giọt nước, sóng nhẹ, icon tròn',
    imagery: 'ảnh thiên nhiên, sáng, nhiều màu xanh',
  },
  edu: {
    name: 'Trẻ trung, học thuật (người lớn)',
    fits: 'trung tâm ngoại ngữ, luyện thi, kỹ năng, khoá học cho học sinh lớn/người đi làm',
    palette: '1 màu chính tươi (xanh dương, tím, đỏ cờ) + 1–2 màu phụ vui (vàng, xanh ngọc); nền trắng',
    type: 'Lexend, Plus Jakarta Sans, Bricolage Grotesque, Be Vietnam Pro; tiêu đề đậm có highlight sau chữ',
    shape: 'bo vừa–lớn, thẻ khoá học có nhãn màu',
    depth: 'bóng mềm, gạch chân/marker màu sau từ khoá',
    decor: 'nhãn cấp độ, thanh tiến độ, lịch khai giảng, huy hiệu điểm số',
    imagery: 'ảnh lớp học, học viên thật, khung ảnh có viền màu',
  },
  tech: {
    name: 'Công nghệ, hiện đại tối',
    fits: 'công nghệ, phần mềm, thiết bị điện tử, an ninh/camera, thang máy thông minh, năng lượng mặt trời',
    palette: 'nền tối (xanh đen/than) + màu neon (xanh điện, tím, lục lam), gradient phát sáng nhẹ',
    type: 'Space Grotesk, Manrope, Inter, Chakra Petch cho số liệu',
    shape: 'bo vừa, thẻ kính mờ (bg-white/5 + border-white/10 + backdrop-blur)',
    depth: 'glow nhẹ quanh nút/khối nổi bật, gradient tối',
    decor: 'lưới chấm, đường mạch, thông số kỹ thuật dạng bảng',
    imagery: 'ảnh sản phẩm trên nền tối, ánh sáng viền',
  },
  minimal: {
    name: 'Tối giản (minimal)',
    fits: 'kiến trúc, studio thiết kế, nhiếp ảnh, công chứng/văn phòng luật nhỏ, thương hiệu đã rất tối giản',
    palette: 'trắng/đen + 1 màu nhấn duy nhất dùng tiết kiệm',
    type: 'Inter, Manrope, Be Vietnam Pro; hoặc serif lớn cho tiêu đề',
    shape: 'góc vuông/bo nhỏ, viền mảnh',
    depth: 'không bóng, không gradient',
    decor: 'khoảng trắng lớn, đường kẻ mảnh',
    imagery: 'ảnh lớn, ít, chất lượng cao',
  },
};

export const VISUAL_KEYS = Object.keys(VISUAL_STYLES);
export function visualText(key) {
  const v = VISUAL_STYLES[key];
  if (!v) return '';
  return `${v.name}
- Màu: ${v.palette}
- Chữ: ${v.type}
- Hình khối: ${v.shape}
- Chiều sâu: ${v.depth}
- Hoạ tiết: ${v.decor}
- Ảnh: ${v.imagery}`;
}
