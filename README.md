# 🤖 Gemini Chrome Extension

Chrome Extension để chat với Gemini AI trực tiếp từ trình duyệt, hỗ trợ cả **Google OAuth** và **API Key**.

## ✨ Tính năng

- 💬 Chat với Gemini AI ngay trên Chrome
- 🔐 Hỗ trợ 2 phương thức xác thực:
  - **Google OAuth**: 1000 requests/ngày
  - **API Key**: 100 requests/ngày
- 🌐 Tự động lấy context từ trang web hiện tại
- 💻 Highlight code trong phản hồi
- 📊 Theo dõi quota và thống kê sử dụng
- 🎨 Giao diện thân thiện, dễ sử dụng

## 🚀 Cài đặt

1. Clone hoặc download repository này
2. Mở Chrome và truy cập `chrome://extensions/`
3. Bật "Developer mode" ở góc trên bên phải
4. Click "Load unpacked" và chọn thư mục `gemini-extension`
5. Extension sẽ xuất hiện trong thanh công cụ Chrome

## 🔑 Cấu hình

### Phương án 1: Google OAuth (Khuyến nghị)

1. Click vào icon extension
2. Chọn "Đăng nhập với Google"
3. Cho phép quyền truy cập
4. Bắt đầu chat với quota **1000 requests/ngày**

**Lưu ý**: Để sử dụng OAuth, bạn cần cấu hình OAuth trong manifest.json:

- Tạo project tại [Google Cloud Console](https://console.cloud.google.com/)
- Enable Gemini API
- Tạo OAuth 2.0 credentials
- Thêm `oauth2.client_id` vào manifest.json

### Phương án 2: API Key (Dễ setup)

1. Lấy API key từ [Google AI Studio](https://aistudio.google.com/apikey)
2. Click vào icon extension
3. Chọn "Sử dụng API Key"
4. Nhập API key và click "Lưu"
5. Bắt đầu chat với quota **100 requests/ngày**

**Ưu điểm**:

- Dễ setup, không cần cấu hình OAuth
- Phù hợp cho người dùng cá nhân
- Không cần tạo Google Cloud Project

**Nhược điểm**:

- Quota thấp hơn (100 vs 1000 requests/ngày)
- Cần quản lý API key thủ công

## 📝 Sử dụng

1. Click vào icon extension để mở popup
2. Nhập câu hỏi hoặc yêu cầu
3. Extension sẽ tự động phân tích context từ trang web nếu cần
4. Nhận câu trả lời từ Gemini AI

### Tính năng nâng cao

- **Tự động lấy context**: Tự động phân tích nội dung trang web khi câu hỏi có liên quan
- **Highlight code**: Tự động format và highlight code trong phản hồi
- **Thống kê**: Theo dõi số lượng requests đã sử dụng

## 🔧 Cấu trúc dự án

```
gemini-extension/
├── manifest.json       # Cấu hình extension
├── popup.html         # Giao diện popup
├── popup.js           # Logic xử lý UI
├── auth.js            # Quản lý authentication (OAuth & API Key)
├── background.js      # Service worker
├── styles.css         # Stylesheet
├── icons/            # Icons cho extension
└── README.md         # File này
```

## 🛠️ API & Models

Extension sử dụng Gemini API với các models khác nhau:

- **API Key**: `gemini-1.5-flash-latest` (stable, reliable)
- **OAuth**: `gemini-2.0-flash-exp` (latest features)

## 🔒 Bảo mật

- API keys được lưu trữ local trong Chrome storage
- OAuth tokens được quản lý bởi Chrome Identity API
- Không có dữ liệu nào được gửi đến server của bên thứ ba

## 🐛 Xử lý lỗi

Extension tự động xử lý các lỗi phổ biến:

- **API key không hợp lệ**: Yêu cầu cấu hình lại
- **Hết quota**: Gợi ý đợi đến ngày mai hoặc chuyển sang OAuth
- **Lỗi network**: Thông báo kiểm tra kết nối
- **Token hết hạn**: Tự động yêu cầu đăng nhập lại

## 📊 Quota Limits

| Phương thức | Requests/ngày | Model                   |
| ----------- | ------------- | ----------------------- |
| OAuth       | 1,000         | gemini-2.0-flash-exp    |
| API Key     | 100           | gemini-1.5-flash-latest |

## 🤝 Đóng góp

Mọi đóng góp đều được hoan nghênh! Vui lòng:

1. Fork repository
2. Tạo branch mới
3. Commit changes
4. Push và tạo Pull Request

## 📄 License

MIT License

---

**Lưu ý**: Extension này dành cho mục đích học tập và sử dụng cá nhân. Vui lòng tuân thủ [Terms of Service của Google Gemini](https://ai.google.dev/terms).
# browser-agent
