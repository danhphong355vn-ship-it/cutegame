\# MULTI AI RULES



Project này được CODEX và ANTIGRAVITY cùng sửa trực tiếp.



SOURCE CHÍNH:

C:\\cute\_game-main\\cute\_game-main



\## QUY TẮC BẮT BUỘC



1\. Trước mỗi task phải đọc:

&#x20;  - .ai/RULES.md

&#x20;  - .ai/CODEX\_STATUS.md

&#x20;  - .ai/ANTIGRAVITY\_STATUS.md



2\. Mỗi AI chỉ được cập nhật file STATUS của chính mình.



3\. Trước khi sửa code phải ghi:

&#x20;  - Status

&#x20;  - Task

&#x20;  - Claimed files



4\. Không được sửa bất kỳ file nào đang được AI kia CLAIM.



5\. Nếu cần sửa cùng một file:

&#x20;  - DỪNG

&#x20;  - Status = BLOCKED

&#x20;  - báo người dùng.



6\. Trước mỗi lần ghi file phải kiểm tra lại STATUS của AI kia.



7\. TUYỆT ĐỐI KHÔNG dùng:

&#x20;  git add .

&#x20;  git add -A



8\. Chỉ được stage chính xác file mình đã sửa:

&#x20;  git add path/file1 path/file2



9\. Trước khi commit phải chạy:

&#x20;  git status

&#x20;  git diff --cached --name-only



10\. Nếu staged files có file của AI khác:

&#x20;   DỪNG và bỏ stage file đó.



11\. Không reset/restore/revert file đang được AI khác sửa.



12\. Không chạy:

&#x20;   git reset --hard

&#x20;   git restore .

&#x20;   git checkout -- .

&#x20;   git clean -fd



13\. Sau khi hoàn thành:

&#x20;   - chạy test liên quan

&#x20;   - npm.cmd test nếu phù hợp

&#x20;   - npm.cmd run build

&#x20;   - commit CHỈ các file của mình

&#x20;   - cập nhật Status = DONE



14\. Không tự ý thay đổi kiến trúc/phần AI kia đang làm.

