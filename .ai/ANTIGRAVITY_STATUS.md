# ANTIGRAVITY STATUS

Status: DONE

Completed Tasks:
1. Xây dựng Màn hình Khởi Đầu Game (Cinematic Title Screen & Landing Screen):
   - Logo Zoo Garden phát sáng thở (breathing glow neon pulse).
   - Nút lớn 'CHẠM ĐỂ BẮT ĐẦU' (TAP TO START / VÀO GAME) với âm thanh Web Audio API chime đa tầng.
   - Bộ chọn chế độ (Mode Selector): Chơi Trực Tuyến (Multiplayer - hiện Ping, status máy chủ) vs Khám Phá Một Mình (Offline Solo).
   - Bảng Tin Sự Kiện & Cập Nhật (Live News Banner): Giờ vàng PvP, World Boss Rồng Lửa / Vua Nấm Titan / Kraken Biển Sâu.
   - Thẻ Xem Trước Nhân Vật (Character Preview Card): Tên, cấp độ, trang bị đang mặc (vũ khí, mũ, pet), tiền vàng và bảng chọn màu sắc.
   - Camera Cinematic 3D xoay cảnh nhẹ nhàng ngắm khu vườn/làng trước khi vào game.
2. Tạo Hành Tinh Đấu Trường Riêng (Arena Colosseum Planet):
   - Đăng ký PLANETS.arena và STAR_MAP trên bản đồ sao của phi thuyền tọa độ (0, -260) với vòng đai vàng rực rỡ.
   - Trạm phi thuyền riêng tại (0, 24), Đại Điện Tượng Vinh Danh (Hall of Fame) tại (-10, 18), Tiệm Trang Bị Đấu Sĩ tại (10, 18), lò đuốc La Mã đón chào.
   - Chuyển toàn bộ đấu trường La Mã 3D sang tọa độ (0, 0) trên Hành Tinh Đấu Trường, không có quái vật hay chướng ngại vật cản đường.
3. Menu Tương Tác Người Chơi & Thách Đấu Cá Cược 1v1 (Wager Duel System):
   - Menu Player Action Card tương tác khi click người chơi khác ở mọi hành tinh: hiển thị avatar màu, cấp độ, trang phục & vũ khí đang mặc, 4 nút (⚔️ Thách Đấu Cá Cược, 💬 Nhắn Tin, 🤝 Kết Bạn, 🏡 Thăm Vườn).
   - Bộ chọn mức cược Wager Bet: 🌿 Giao Hữu (0 Vàng), 🪙 100, 🪙 500, 🪙 1.000, 💎 5.000 Vàng, kiểm tra số dư ví tiền của cả 2 trước khi gửi.
   - Lời mời thách đấu hiển thị popup đếm ngược 15s kèm âm thanh cảnh báo còi hiệu, nút Chấp Nhận / Từ Chối.
   - Tự động trừ tiền cược vào quỹ thưởng (pot = bet * 2), dịch chuyển cả 2 sang Võ Đài La Mã ở 2 góc đối xứng (-7, 0) và (7, 0).
   - Khóa mục tiêu 1v1 riêng biệt (người ngoài không can thiệp được), màn hình đếm ngược to 3... 2... 1... CHIẾN!
   - Người thắng nhận toàn bộ quỹ thưởng pot rót thẳng vào túi + pháo hoa Confetti tung bừng + ghi nhận +1 Trận Thắng Bảng Vàng.
   - Người thua chỉ mất tiền cược, toàn bộ trang bị và ba lô giữ nguyên 100%, tự động hồi đầy máu và chuyển ra sảnh an toàn.

Claimed files: none

Notes:
Đã hoàn thành và xác minh đầy đủ: npm run build thành công 100%, test suite duel và network pass 100%.
