var webpack = require('webpack'),
  path = require('path'),
  fs = require('fs'),
  fileSystem = require('fs-extra'),
  env = require('./utils/env'),
  CopyWebpackPlugin = require('copy-webpack-plugin'),
  HtmlWebpackPlugin = require('html-webpack-plugin'),
  TerserPlugin = require('terser-webpack-plugin');
var { CleanWebpackPlugin } = require('clean-webpack-plugin');

const ASSET_PATH = process.env.ASSET_PATH || '/';

var alias = {};

// load the secrets
var secretsPath = path.join(__dirname, 'secrets.' + env.NODE_ENV + '.js');

var fileExtensions = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'eot',
  'otf',
  'svg',
  'ttf',
  'woff',
  'woff2',
];

if (fileSystem.existsSync(secretsPath)) {
  alias['secrets'] = secretsPath;
}

// Load environment variables BEFORE webpack config evaluation
// This ensures DefinePlugin can access them
// Webpack's built-in dotenv loads variables, but DefinePlugin needs them available during config evaluation

function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    content.split('\n').forEach((line) => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

// Load .env files in priority order (later files override earlier ones)
const mode = process.env.NODE_ENV || 'development';
loadEnvFile(path.join(__dirname, '.env'));
loadEnvFile(path.join(__dirname, '.env.local'));
loadEnvFile(path.join(__dirname, `.env.${mode}`));
loadEnvFile(path.join(__dirname, `.env.${mode}.local`));

// Build-time check: log whether Pusher key will be injected (so "PUSHER_KEY not set" can be debugged)
const pusherKeyAtBuild = process.env.WEBPACK_PUSHER_KEY || process.env.NEXT_PUBLIC_PUSHER_KEY || process.env.PUSHER_KEY || '';
if (pusherKeyAtBuild) {
  console.log('[webpack] Pusher key will be injected (value redacted)');
} else {
  console.warn('[webpack] WEBPACK_PUSHER_KEY not set; extension will use polling. Set it in .env.local and rebuild.');
}

var options = {
  mode: mode,
  // Use Webpack 5.103.0+ built-in dotenv feature
  // This eliminates conflicts with DefinePlugin and provides better security
  // Files load in order, with later files overriding earlier ones
  // Priority: .env < .env.local < .env.[mode] < .env.[mode].local
  dotenv: {
    prefix: 'WEBPACK_', // Only expose variables with WEBPACK_ prefix (security best practice)
    // dir defaults to project root (current directory), so we don't need to specify it
    template: [
      '.env',              // Base environment variables
      '.env.local',        // Local overrides (gitignored, highest priority for local)
      '.env.[mode]',       // Mode-specific (e.g., .env.development, .env.production)
      '.env.[mode].local', // Mode-specific local overrides (highest priority)
    ],
  },
  entry: {
    newtab: path.join(__dirname, 'src', 'pages', 'Newtab', 'index.jsx'),
    options: path.join(__dirname, 'src', 'pages', 'Options', 'index.jsx'),
    popup: path.join(__dirname, 'src', 'pages', 'Popup', 'index.jsx'),
    background: path.join(__dirname, 'src', 'pages', 'Background', 'index.ts'),
    contentScript: path.join(__dirname, 'src', 'pages', 'Content', 'index.ts'),
    nativeDialogOverride: path.join(__dirname, 'src', 'pages', 'Content', 'nativeDialogOverride.js'),
    devtools: path.join(__dirname, 'src', 'pages', 'Devtools', 'index.js'),
    panel: path.join(__dirname, 'src', 'pages', 'Panel', 'index.jsx'),
  },
  chromeExtensionBoilerplate: {
    notHotReload: ['background', 'contentScript', 'devtools', 'nativeDialogOverride'],
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'build'),
    clean: true,
    publicPath: ASSET_PATH,
  },
  module: {
    rules: [
      {
        // look for .css or .scss files
        test: /\.(css|scss)$/,
        // in the `src` directory
        use: [
          {
            loader: 'style-loader',
          },
          {
            loader: 'css-loader',
          },
          {
            loader: 'sass-loader',
            options: {
              sourceMap: true,
            },
          },
        ],
      },
      {
        test: new RegExp('.(' + fileExtensions.join('|') + ')$'),
        type: 'asset/resource',
        exclude: /node_modules/,
        // loader: 'file-loader',
        // options: {
        //   name: '[name].[ext]',
        // },
      },
      {
        test: /\.html$/,
        loader: 'html-loader',
        exclude: /node_modules/,
      },
      // { test: /\.(ts|tsx)$/, loader: 'babel-loader', exclude: /node_modules/ },
      {
        test: /\.(js|jsx|ts|tsx)$/,
        use: [
          {
            loader: 'source-map-loader',
          },
          {
            loader: 'babel-loader',
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    alias: alias,
    extensions: fileExtensions
      .map((extension) => '.' + extension)
      .concat(['.js', '.jsx', '.ts', '.tsx', '.css']),
  },
  // Configure node polyfills - process is provided by DefinePlugin, not as a global
  node: {
    global: false, // Don't provide global polyfill
    __filename: false,
    __dirname: false,
  },
  plugins: [
    new CleanWebpackPlugin({ verbose: false }),
    new webpack.ProgressPlugin(),
    // expose and write the allowed env vars on the compiled bundle
    new webpack.EnvironmentPlugin(['NODE_ENV']),
    // Inject environment variables into bundle
    // Built-in dotenv (above) loads variables from .env files into process.env during build
    // DefinePlugin replaces process.env.* references with actual string values in the bundle
    // Note: Built-in dotenv with prefix only exposes WEBPACK_* variables automatically
    // We use DefinePlugin to explicitly inject all variables we need
    new webpack.DefinePlugin({
      // API_BASE - read from WEBPACK_API_BASE (loaded by built-in dotenv) or fallback
      // These will be replaced with actual string values at build time
      'process.env.WEBPACK_API_BASE': JSON.stringify(
        process.env.WEBPACK_API_BASE || process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || 'https://api.example.com'
      ),
      'process.env.NEXT_PUBLIC_API_BASE': JSON.stringify(
        process.env.WEBPACK_API_BASE || process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || 'https://api.example.com'
      ),
      'process.env.API_BASE': JSON.stringify(
        process.env.WEBPACK_API_BASE || process.env.NEXT_PUBLIC_API_BASE || process.env.API_BASE || 'https://api.example.com'
      ),
      // Pusher/Soketi for real-time message sync (REALTIME_MESSAGE_SYNC_ROADMAP.md §11.11)
      'process.env.WEBPACK_PUSHER_KEY': JSON.stringify(
        process.env.WEBPACK_PUSHER_KEY || process.env.NEXT_PUBLIC_PUSHER_KEY || process.env.PUSHER_KEY || ''
      ),
      'process.env.WEBPACK_PUSHER_WS_HOST': JSON.stringify(
        process.env.WEBPACK_PUSHER_WS_HOST || process.env.PUSHER_WS_HOST || 'localhost'
      ),
      'process.env.WEBPACK_PUSHER_WS_PORT': JSON.stringify(
        process.env.WEBPACK_PUSHER_WS_PORT || process.env.PUSHER_WS_PORT || '3005'
      ),
      // DEBUG_MODE - read from .env files (loaded by built-in dotenv, even without prefix)
      // Built-in dotenv loads ALL variables into process.env during build, but only exposes prefixed ones
      // So we can read DEBUG_MODE here even though it doesn't have WEBPACK_ prefix
      'process.env.DEBUG_MODE': JSON.stringify(process.env.DEBUG_MODE || 'false'),
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/manifest.json',
          to: path.join(__dirname, 'build'),
          force: true,
          transform: function (content, path) {
            // generates the manifest file using the package.json informations
            return Buffer.from(
              JSON.stringify({
                description: process.env.npm_package_description,
                version: process.env.npm_package_version,
                ...JSON.parse(content.toString()),
              })
            );
          },
        },
      ],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/pages/Content/content.styles.css',
          to: path.join(__dirname, 'build'),
          force: true,
        },
      ],
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/assets/img/icon-128.png',
          to: path.join(__dirname, 'build', 'icon-128.png'),
          force: true,
        },
        {
          from: 'src/assets/img/icon-34.png',
          to: path.join(__dirname, 'build', 'icon-34.png'),
          force: true,
        },
      ],
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Newtab', 'index.html'),
      filename: 'newtab.html',
      chunks: ['newtab'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Options', 'index.html'),
      filename: 'options.html',
      chunks: ['options'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Popup', 'index.html'),
      filename: 'popup.html',
      chunks: ['popup'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Devtools', 'index.html'),
      filename: 'devtools.html',
      chunks: ['devtools'],
      cache: false,
    }),
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'src', 'pages', 'Panel', 'index.html'),
      filename: 'panel.html',
      chunks: ['panel'],
      cache: false,
    }),
  ],
  infrastructureLogging: {
    level: 'info',
  },
  experiments: {
    asyncWebAssembly: true,
  },
};

if (env.NODE_ENV === 'development') {
  options.devtool = 'cheap-module-source-map';
} else {
  options.optimization = {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
      }),
    ],
  };
}

module.exports = options;
