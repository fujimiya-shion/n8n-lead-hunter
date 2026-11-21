// "Hướng nghệ thuật" = ngôn ngữ bố cục chung cho cả bộ demo (KHÔNG gắn với ngành).
// LLM tự chọn 1 hướng hợp với doanh nghiệp (danh sách được xáo mỗi lần, tránh trùng các bản gần đây).
// Mỗi hướng mô tả cách các loại khối trông ra sao, để các bản demo khác nhau ở cấu trúc chứ không chỉ ở màu/nội dung.
export const DIRECTIONS = {
  editorial: {
    name: 'Tạp chí (editorial)',
    desc: 'Tiêu đề rất lớn kiểu bìa tạp chí, ảnh lớn cắt theo cột, cột chữ hẹp, đường kẻ mảnh và số mục lớn làm điểm nhấn; bố cục lệch cột (ảnh 2/3 – chữ 1/3, đổi bên giữa các khối); gần như không dùng thẻ (card) có viền; trích dẫn lớn chen giữa trang.',
  },
  poster: {
    name: 'Áp phích chữ lớn (poster)',
    desc: 'Mở trang bằng câu tiêu đề khổng lồ chiếm gần hết màn hình đầu, có thể không cần ảnh; các khối là mảng màu đặc lớn (primary / ink / surface) đổi nhịp mạnh; mỗi khối ít chữ, 1 ý chính; danh sách dạng dòng chữ to; nút to, rõ.',
  },
  photo: {
    name: 'Ảnh dẫn dắt (photo-led)',
    desc: 'Hero là ảnh tràn toàn chiều ngang có lớp phủ và chữ đặt trên ảnh; trang xen các dải ảnh full-width; dịch vụ trình bày bằng thẻ ảnh lớn (ảnh chiếm phần lớn thẻ, chữ phủ hoặc ngay dưới); ít khối chỉ có chữ.',
  },
  catalog: {
    name: 'Danh mục để duyệt nhanh (catalog)',
    desc: 'Trọng tâm là duyệt và chọn: hàng chip/tab lọc theo nhóm, lưới thẻ dày 3–4 cột có ảnh nhỏ + tên + giá/thời lượng + nút; thanh tìm kiếm hoặc ô chọn nhanh ngay đầu trang; hero ngắn gọn, thấp.',
  },
  infodesk: {
    name: 'Bàn tra cứu (info-dense)',
    desc: 'Giống trang tra cứu chuyên nghiệp: hero gọn kèm ô đặt lịch/tra cứu ngay màn hình đầu; thông tin trình bày bằng bảng kẻ ô, bảng so sánh, cột thông số, khối "cần mang gì / mất bao lâu / chi phí"; mật độ thông tin cao nhưng thẳng hàng, dễ quét.',
  },
  story: {
    name: 'Kể chuyện theo dòng (story)',
    desc: 'Trang chạy như một câu chuyện: vấn đề của khách → cách làm → kết quả; timeline dọc có đường nối; ảnh và chữ so le trái/phải theo từng chặng; trích dẫn lớn; khối cuối là lời mời hành động gắn với câu chuyện.',
  },
  split: {
    name: 'Chia đôi màn hình (split-screen)',
    desc: 'Nhiều khối chia 2 nửa bằng nhau sát mép (một nửa ảnh/mảng màu tràn, một nửa nội dung); màn hình đầu chia đôi toàn chiều cao; đổi bên liên tục; danh sách đặt trong nửa nội dung; ít container hẹp ở giữa.',
  },
  bento: {
    name: 'Lưới ô bento',
    desc: 'Trang chủ như một bảng ô kích thước khác nhau ghép khít: ô ảnh lớn, ô số liệu, ô giờ làm việc, ô bản đồ/địa chỉ, ô đánh giá, ô dịch vụ; ít section dài kiểu tiêu đề-rồi-lưới; màn hình đầu đã là một lưới ô.',
  },
  typographic: {
    name: 'Tối giản chữ (typographic)',
    desc: 'Gần như không ảnh và không thẻ; typography là chính: danh sách đánh số rất lớn, tiêu đề lệch trái, đường kẻ toàn chiều ngang, nhiều khoảng trắng; điểm nhấn là cỡ chữ và độ đậm, màu dùng cực tiết chế.',
  },
  friendly: {
    name: 'Thân thiện, khối mềm (friendly)',
    desc: 'Khối bo tròn lớn nền màu nhạt khác nhau (từ primary/accent pha nhạt), icon/minh hoạ to, nút to dễ bấm, thông tin chia nhỏ thành nhiều thẻ màu; giọng gần gũi; bố cục ưu tiên điện thoại.',
  },
  dark: {
    name: 'Nền tối cao cấp (dark)',
    desc: 'Phần lớn trang nền tối (ink hoặc gần đen), chữ sáng, ảnh có ánh sáng ấm nổi trên nền tối, viền mảnh màu accent, khoảng cách rộng, ít khối nhưng mỗi khối chăm chút; vài khối sáng để đổi nhịp.',
  },
};

export const DIRECTION_KEYS = Object.keys(DIRECTIONS);
export const directionText = (key) => (DIRECTIONS[key] ? `${DIRECTIONS[key].name}: ${DIRECTIONS[key].desc}` : '');
