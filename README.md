# SmartFind: AI-Enhanced Search Extension

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Available-brightgreen)](https://chrome.google.com/webstore)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/danebentley/smartfind-extension)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

A Chrome extension that revolutionizes webpage search by combining AI-powered semantic understanding with traditional keyword matching. SmartFind replaces your browser's default Ctrl+F functionality with intelligent search that understands natural language queries.

## 🚀 Key Features

- **🤖 AI-Powered Search**: Ask natural questions like "Where is the contact information?" or "What are the main conclusions?"
- **⚡ Progressive Search**: Automatically tries keyword search first, then AI when no matches are found
- **🎯 Force Search Modes**: Use `/` prefix for AI search, `'` prefix for keyword-only search
- **🔍 Smart Highlighting**: Intelligent text highlighting with context-aware results
- **☁️ Cross-Device Sync**: Sign in to sync tokens and purchases across all devices
- **💳 Flexible Payment**: Pay any amount from $1-$500 (100 tokens per $1)
- **🔒 Privacy-First**: No permanent storage of search queries or webpage content

## 🎯 Single Purpose

SmartFind's single purpose is to enhance webpage search functionality by providing AI-powered semantic search capabilities alongside traditional keyword search, replacing the browser's default Ctrl+F functionality.

## 📦 Installation

### From Chrome Web Store (Recommended)
1. Visit the [Chrome Web Store](https://chrome.google.com/webstore) (link pending publication)
2. Click "Add to Chrome"
3. Confirm installation

### Manual Installation (Development)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory

## 🔧 Usage

### Basic Search
1. Press **Ctrl+F** (or **Cmd+F** on Mac) on any webpage
2. Type your query and press Enter
3. SmartFind automatically chooses the best search method

### Advanced Search Modes
- **AI Search**: Use `/what is this article about` for semantic understanding
- **Keyword Search**: Use `'specific term` for exact text matching
- **Auto Mode**: Just type normally - SmartFind decides the best approach

### Authentication (Optional)
- Click the extension icon to open the popup
- Sign in with Google or email for cross-device sync
- Anonymous usage works without sign-in (local storage only)

## 🏗️ Architecture

### Frontend (Chrome Extension)
- **Content Script**: Main search interface and functionality
- **Background Script**: Message handling and authentication
- **Popup**: User interface for account management
- **Manifest V3**: Latest Chrome extension standards

### Backend (Vercel)
- **API Endpoints**: RESTful API for AI processing and user management
- **AI Processing**: Cerebras AI for semantic search
- **Authentication**: JWT tokens with Google OAuth support
- **Database**: Supabase for user data and token management
- **Payments**: Stripe for secure payment processing

## 🔐 Security & Privacy

- **No Data Storage**: Search queries and webpage content are never stored permanently
- **Encrypted Transmission**: All data uses HTTPS/TLS encryption
- **Minimal Permissions**: Only requests necessary Chrome permissions
- **Privacy-First**: Detailed privacy policy with full transparency
- **Secure Authentication**: JWT tokens with proper expiration

## 🌟 Chrome Web Store Compliance

### Manifest V3 Features
- Service worker background script
- Declarative permissions
- Content Security Policy
- Host permissions for API access

### Privacy & Security
- Comprehensive privacy policy
- Single purpose functionality
- No data collection beyond necessary functionality
- Secure third-party integrations

### Quality Standards
- Production-ready code with error handling
- Comprehensive testing
- Professional UI/UX design
- Responsive support

## 🛠️ Development

### Prerequisites
- Node.js 16+ (for backend development)
- Chrome browser for testing
- Vercel account (for backend deployment)

### Local Development
```bash
# Clone the repository
git clone https://github.com/danebentley/smartfind-extension.git
cd smartfind-extension

# Load extension in Chrome
# 1. Open chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select this directory

# For backend development
npm install
npm run dev
```

### Environment Variables
```bash
# Required for backend (Vercel)
CEREBRAS_API_KEY=your_cerebras_api_key
STRIPE_SECRET_KEY=sk_live_or_test_key
STRIPE_WEBHOOK_SECRET=whsec_webhook_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
JWT_SECRET=your_super_secret_jwt_key
```

### Testing
```javascript
// Test in browser console on any webpage
chrome.runtime.sendMessage({ 
  action: "aiSearch", 
  query: "test query" 
}, console.log);
```

## 📊 Token System

- **Free Tier**: 50 searches per account
- **Paid Tokens**: $1 = 100 tokens (1¢ per search)
- **Flexible Payment**: Choose any amount from $1-$500
- **Cross-Device Sync**: Authenticated users get tokens on all devices
- **No Subscription**: Pay-as-you-go model

## 🤝 Support

### Getting Help
- **Documentation**: Comprehensive help available in extension
- **Contact**: Email support at danebentley2004@gmail.com
- **Response Time**: Typically within 48 hours
- **Bug Reports**: Use the contact form for technical issues

### Common Issues
- **No Results**: Try AI search with `/` prefix
- **Slow Performance**: Large pages may take a few seconds
- **Token Issues**: Use "Check Purchases" button in popup
- **Google Workspace**: Automatically uses native browser search

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Cerebras AI** for semantic search processing
- **Supabase** for secure database hosting
- **Stripe** for payment processing
- **Google** for Chrome extension platform

## 📈 Roadmap

- [ ] Firefox extension support
- [ ] Additional AI models
- [ ] Bulk search operations
- [ ] Search history (optional)
- [ ] Team collaboration features

---

**Developer**: Dane Bentley  
**Email**: danebentley2004@gmail.com  
**Website**: [SmartFind Extension](https://smartfind-extension-kozhz9ds1.vercel.app)

*Built with ❤️ for better web search experiences* 