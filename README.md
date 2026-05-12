# DATN_MICHI

## Hướng dẫn sử dụng công cụ Crawl Data (`crawData.bat`)

Công cụ `crawData.bat` được sử dụng để tự động lấy dữ liệu (crawl) sản phẩm, tải hình ảnh và đưa vào hệ thống thông qua API của backend. Dưới đây là hướng dẫn chi tiết cách sử dụng:

### 1. Điều kiện tiên quyết
- Backend API (MiiChin) phải đang chạy tại cổng mặc định (`http://localhost:5000` hoặc cổng được cấu hình).
- Đã cài đặt `.NET SDK` và `curl` trên máy tính.
- Nếu có sử dụng AI để gợi ý phối màu/chất liệu, cần đảm bảo đã thiết lập biến môi trường `GEMINI_API_KEY`.

### 2. Cách chạy lệnh cơ bản
Mở Command Prompt (cmd) hoặc PowerShell tại thư mục gốc của dự án (`DATN_MICHI`) và gõ các lệnh sau:

- **Chạy mặc định (Crawl số lượng sản phẩm mặc định):**
  ```cmd
  crawData.bat
  ```

- **Chỉ định số lượng sản phẩm muốn crawl (ví dụ: 30 sản phẩm):**
  ```cmd
  crawData.bat 30
  ```

### 3. Các cờ (Flags) hỗ trợ
Công cụ có hỗ trợ một số tham số mở rộng để kiểm tra lỗi hoặc chạy mô phỏng:

- **Chạy ở chế độ mô phỏng (`-DryRun`):**
  Chế độ này sẽ chỉ tải ảnh và tạo dữ liệu ở mức log ra màn hình, KHÔNG lưu sản phẩm thật vào database.
  ```cmd
  crawData.bat 30 -DryRun
  ```

- **Chạy ở chế độ chi tiết (`-Verbose`):**
  In ra toàn bộ log, payload JSON và các trạng thái HTTP để dễ dàng debug nếu quá trình import gặp lỗi.
  ```cmd
  crawData.bat 30 -Verbose
  ```

- **Kết hợp các cờ:**
  ```cmd
  crawData.bat 10 -DryRun -Verbose
  ```

### 4. Xử lý lỗi thường gặp
- **Lỗi `Không kết nối được đến backend`:** Hãy kiểm tra xem bạn đã chạy lệnh `dotnet run` ở thư mục `backend` chưa.
- **Lỗi `Unsplash API Rate Limit`:** Công cụ tự động tải ảnh từ web, nếu request quá nhanh có thể bị chặn tải ảnh tạm thời, hãy đợi vài phút và thử lại.
- **Dữ liệu thiếu ảnh:** Hệ thống đã được thiết lập để **không import** các sản phẩm tải ảnh thất bại nhằm bảo vệ tính toàn vẹn của giao diện cửa hàng. Hãy kiểm tra kết nối mạng của bạn.