# Boss thế giới và võ đài PvP

Chạy bản multiplayer bằng `npm.cmd run build` rồi `npm.cmd start`. Sau khi cập nhật server, dừng bản cũ bằng Ctrl+C, khởi động lại và tải trang bằng Ctrl+F5.

## Boss thế giới

- Tự xuất hiện mỗi 150 phút khi server chạy; luân phiên Rồng Lửa tại Đảo Núi Lửa, Vua Nấm Titan tại Đồng Cỏ Hồ Xanh và Kraken Biển Sâu tại Đại Dương.
- Tồn tại 30 phút. Admin có thể triệu hồi ngay trong `/admin`.
- Chỉ có một sự kiện hoạt động, tại phòng công cộng của hành tinh. Người ở phòng nhóm riêng cần quay lại thế giới công cộng.
- Mọi tài khoản đang online nhận thông báo. Người vào sau thấy boss hiện tại và thời gian còn lại.
- Server ghi lượng sát thương thực và công bố 5 người gây sát thương cao nhất khi kết thúc.
- Mỗi người gây sát thương nhận EXP, loot riêng vào rương ở nhà, thêm 3 mảnh sao và 1.000 năng lượng. Người đã rời phòng vẫn nhận thưởng nếu chưa bắt đầu một cuộc phiêu lưu mới. Không cần tranh nhặt đồ của người khác.
- Sự kiện đang hoạt động và lịch chờ nằm trong bộ nhớ server; khởi động lại server sẽ bắt đầu chu kỳ chờ mới. Phần thưởng đã lưu vẫn còn.

## Võ đài

- Tới Đảo Núi Lửa ở phòng công cộng rồi bấm **Tham gia võ đài**. Nhân vật được đưa vào vòng vàng tại `(0, -48)`, bán kính 14.
- Chỉ người đã tham gia và còn trong vòng mới đánh được nhau. Có 3 giây bảo vệ sau khi tham gia.
- Dùng phím Space hoặc nút đánh, và Q/W/E/R để dùng chiêu. Khi bị khống chế, không thể di chuyển hoặc tấn công, tối đa 2 giây mỗi lần.
- Máu thi đấu riêng; hồi máu kỹ năng tác động vào máu thi đấu. Thua không rơi đồ hoặc giảm máu ngoài võ đài. Điểm thắng/thua lưu trong tài khoản.
- Rời vòng, rời hành tinh, ngắt kết nối hoặc bấm **Rời võ đài** sẽ kết thúc việc tham gia. Thú cưng không gây sát thương PvP.

## Test với hai người

1. Mở hai trình duyệt với hai tài khoản khác nhau, cùng ở thế giới công cộng.
2. Admin triệu hồi Vua Nấm; kiểm tra cả hai nhận thông báo và thấy cùng một thanh máu boss. Cả hai đánh boss, một người rời phòng trước khi boss chết; kiểm tra rương và EXP của cả hai, bảng sát thương và không có thưởng trùng.
3. Cho cả hai tới Đảo Núi Lửa và tham gia võ đài. Đợi 3 giây rồi thử đánh thường, chiêu diện rộng và đạn. Kiểm tra máu võ đài giảm, người thua nhận thông báo và điểm được lưu.
4. So sánh túi đồ và máu ngoài võ đài trước/sau. Cho một người không tham gia hoặc đi ra ngoài vòng; kiểm tra người đó không thể bị đánh PvP.

## File triển khai

- `src/world-events.ts`: lịch mặc định, các boss và tọa độ võ đài.
- `server/world-events.mjs`: lịch sự kiện và thông báo toàn server.
- `server/arena.mjs`: máu thi đấu, điều kiện PvP và điểm thắng/thua.
- `server/combat-authority.mjs`: sát thương, phần thưởng boss và kỹ năng PvP.
- `server/server.mjs`: kết nối multiplayer và API Admin.
- `src/world.ts`: boss khổng lồ, vòng võ đài và trạng thái PvP.
- `src/main.ts`: chọn đối thủ PvP và chặn thao tác khi bị khống chế.
- `src/online.ts`, `src/online.css`: thông báo sự kiện, nút tham gia và HUD võ đài.
- `admin/index.html`: điều khiển triệu hồi boss.
- `tests/world-events.test.mjs`, `tests/network.test.mjs`: kiểm tra server, sự kiện, phần thưởng và PvP.
- `tests/online-session.test.mjs`, `tests/static-host.test.mjs`: cập nhật mô phỏng giao diện cho module mới.
