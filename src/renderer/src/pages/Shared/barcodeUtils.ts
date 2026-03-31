import JsBarcode from "jsbarcode";

export type BarcodeTextOverflowMode = "ellipsis" | "wrap";

export interface BarcodeSettings {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  elementSpacing: number;
  barcodeWidthPercent: number;
  barcodeHeightPercent: number;
  showBarcode: boolean;
  showProductName: boolean;
  showPrice: boolean;
  showStoreName: boolean;
  showBarcodeNumber: boolean;
  storeName: string;
  productNameFontSize: number;
  priceFontSize: number;
  storeNameFontSize: number;
  barcodeNumberFontSize: number;
  barWidth: number;
  productNameOverflowMode: BarcodeTextOverflowMode;
}

export const DEFAULT_BARCODE_SETTINGS: BarcodeSettings = {
  marginTop: 1,
  marginBottom: 1,
  marginLeft: 2,
  marginRight: 2,
  elementSpacing: 4,
  barcodeWidthPercent: 90,
  barcodeHeightPercent: 40,
  showBarcode: true,
  showProductName: true,
  showPrice: true,
  showStoreName: false,
  showBarcodeNumber: true,
  storeName: "",
  productNameFontSize: 14,
  priceFontSize: 12,
  storeNameFontSize: 10,
  barcodeNumberFontSize: 12,
  barWidth: 2,
  productNameOverflowMode: "ellipsis",
};

export const MM_TO_PX = 8;
const BARCODE_NUMBER_OFFSET_PX = 2;

type BarcodeHtmlMode = "print" | "preview";

interface BarcodeHtmlInput {
  code: string;
  productName: string;
  priceText: string;
  barcodePrinterWidth: number | string;
  barcodePrinterHeight: number | string;
  barcodeSettings?: Partial<BarcodeSettings>;
}

interface LayoutParams {
  pageWidthPx: number;
  pageHeightPx: number;
  previewWidthPx: number;
  previewHeightPx: number;
  marginTopPx: number;
  marginBottomPx: number;
  marginLeftPx: number;
  marginRightPx: number;
  elementSpacing: number;
  productNameFontSize: number;
  priceFontSize: number;
  storeNameFontSize: number;
  barcodeNumberFontSize: number;
  productNameOverflowMode: BarcodeTextOverflowMode;
  productNameLineCount: number;
  showBarcode: boolean;
  mode: BarcodeHtmlMode;
}

const toPositiveNumber = (value: number | string, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const estimateWrappedLineCount = (
  text: string,
  fontSize: number,
  availableWidthPx: number,
) => {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return 1;
  }

  const approxCharWidth = Math.max(fontSize * 0.55, 1);
  const charsPerLine = Math.max(
    1,
    Math.floor(availableWidthPx / approxCharWidth),
  );
  return Math.max(1, Math.ceil(normalizedText.length / charsPerLine));
};

const buildBarcodeStyle = (params: LayoutParams) => {
  const {
    pageWidthPx,
    pageHeightPx,
    previewWidthPx,
    previewHeightPx,
    marginTopPx,
    marginBottomPx,
    marginLeftPx,
    marginRightPx,
    elementSpacing,
    productNameFontSize,
    priceFontSize,
    storeNameFontSize,
    barcodeNumberFontSize,
    productNameOverflowMode,
    productNameLineCount,
    showBarcode,
    mode,
  } = params;
  const productNameMaxHeight = Math.ceil(
    productNameFontSize * 1.25 * productNameLineCount,
  );

  return `
    ${
      mode === "print"
        ? `
    @page {
      margin: 0;
      padding: 0;
      size: ${pageWidthPx}px ${pageHeightPx}px;
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        width: ${pageWidthPx}px !important;
        height: ${pageHeightPx}px !important;
        max-height: ${pageHeightPx}px !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        page-break-after: avoid !important;
        page-break-before: avoid !important;
        page-break-inside: avoid !important;
      }
    }
    html, body {
      margin: 0;
      padding: 0;
      width: ${pageWidthPx}px;
      height: ${pageHeightPx}px;
      max-height: ${pageHeightPx}px;
      box-sizing: border-box;
      overflow: hidden;
      page-break-after: avoid;
      page-break-before: avoid;
      page-break-inside: avoid;
      background: #fff;
    }
    `
        : `
    .barcode-preview-root {
      width: ${previewWidthPx}px;
      height: ${previewHeightPx}px;
      max-width: ${previewWidthPx}px;
      max-height: ${previewHeightPx}px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .barcode-preview-shell {
      position: relative;
      width: ${previewWidthPx}px;
      height: ${previewHeightPx}px;
      max-width: ${previewWidthPx}px;
      max-height: ${previewHeightPx}px;
      overflow: hidden;
      background: #fff;
      color: #000;
      box-sizing: border-box;
      border-radius: 10px;
      box-shadow:
        0 10px 24px rgba(15, 23, 42, 0.08),
        inset 0 0 0 1.5px rgba(15, 23, 42, 0.18);
    }
    `
    }

    .barcode-page {
      position: relative;
      width: ${pageWidthPx}px;
      height: ${pageHeightPx}px;
      max-width: ${pageWidthPx}px;
      max-height: ${pageHeightPx}px;
      overflow: hidden;
      background: #fff;
      color: #000;
      box-sizing: border-box;
      border-radius: inherit;
    }

    .barcode-container {
      position: absolute;
      top: ${marginTopPx}px;
      right: ${marginRightPx}px;
      bottom: ${marginBottomPx}px;
      left: ${marginLeftPx}px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: ${elementSpacing}px;
      box-sizing: border-box;
      overflow: hidden;
      page-break-inside: avoid;
    }

    .barcode-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      gap: 0;
      max-width: 100%;
      flex-shrink: 0;
      width: 100%;
    }

    .barcode-block svg {
      flex-shrink: 1;
      max-width: 100%;
      object-fit: contain;
      display: block;
    }

    .barcode-container .text-line {
      display: block;
      text-align: center;
      direction: rtl;
      font-weight: bold;
      line-height: 1.2;
      word-wrap: break-word;
      overflow-wrap: anywhere;
      max-width: 100%;
      flex-shrink: 0;
    }

    .barcode-container .store-name {
      font-size: ${storeNameFontSize}px;
      color: #333;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .barcode-container .product-name {
      font-size: ${productNameFontSize}px;
      ${
        productNameOverflowMode === "wrap"
          ? `
      white-space: normal;
      overflow: hidden;
      text-overflow: clip;
      max-height: ${productNameMaxHeight}px;
      `
          : `
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      `
      }
    }

    .barcode-block .barcode-number {
      font-size: ${barcodeNumberFontSize}px;
      direction: ltr;
      letter-spacing: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1;
      margin-top: ${showBarcode ? BARCODE_NUMBER_OFFSET_PX : 0}px;
    }

    .barcode-container .price {
      font-size: ${priceFontSize}px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;
};

export const buildBarcodeLabelHtml = (
  input: BarcodeHtmlInput,
  mode: BarcodeHtmlMode = "print",
) => {
  const barcodeSettings: BarcodeSettings = {
    ...DEFAULT_BARCODE_SETTINGS,
    ...(input.barcodeSettings || {}),
  };
  const normalizedCode = input.code.trim();
  const normalizedProductName = input.productName.trim();
  const normalizedPriceText = input.priceText.trim();
  const normalizedStoreName = barcodeSettings.storeName.trim();

  const barcodePrinterWidth = toPositiveNumber(input.barcodePrinterWidth, 40);
  const barcodePrinterHeight = toPositiveNumber(input.barcodePrinterHeight, 25);
  const pageWidthPx = barcodePrinterWidth * MM_TO_PX;
  const pageHeightPx = barcodePrinterHeight * MM_TO_PX;
  const previewWidthPx = pageWidthPx;
  const previewHeightPx = pageHeightPx;
  const marginTopPx = barcodeSettings.marginTop * MM_TO_PX;
  const marginBottomPx = barcodeSettings.marginBottom * MM_TO_PX;
  const marginLeftPx = barcodeSettings.marginLeft * MM_TO_PX;
  const marginRightPx = barcodeSettings.marginRight * MM_TO_PX;
  const contentWidthPx = Math.max(
    pageWidthPx - marginLeftPx - marginRightPx,
    10,
  );
  const contentHeightPx = Math.max(
    pageHeightPx - marginTopPx - marginBottomPx,
    10,
  );
  const showStoreName =
    barcodeSettings.showStoreName && Boolean(normalizedStoreName);
  const showProductName =
    barcodeSettings.showProductName && Boolean(normalizedProductName);
  const showBarcodeNumber =
    barcodeSettings.showBarcodeNumber && Boolean(normalizedCode);
  const showBarcode = barcodeSettings.showBarcode && Boolean(normalizedCode);
  const showPrice = barcodeSettings.showPrice && Boolean(normalizedPriceText);
  const showBarcodeBlock = showBarcode || showBarcodeNumber;
  const productNameLineCount =
    showProductName && barcodeSettings.productNameOverflowMode === "wrap"
      ? estimateWrappedLineCount(
          normalizedProductName,
          barcodeSettings.productNameFontSize,
          contentWidthPx,
        )
      : 1;

  const storeNameHeightPx = showStoreName
    ? Math.ceil(barcodeSettings.storeNameFontSize * 1.2)
    : 0;
  const productNameHeightPx = showProductName
    ? Math.ceil(
        barcodeSettings.productNameFontSize * productNameLineCount * 1.2,
      )
    : 0;
  const barcodeNumberHeightPx = showBarcodeNumber
    ? Math.ceil(barcodeSettings.barcodeNumberFontSize * 1.05)
    : 0;
  const priceHeightPx = showPrice
    ? Math.ceil(barcodeSettings.priceFontSize * 1.2)
    : 0;
  const topLevelItemsCount = [
    showStoreName,
    showProductName,
    showBarcodeBlock,
    showPrice,
  ].filter(Boolean).length;
  const totalGapHeightPx =
    Math.max(topLevelItemsCount - 1, 0) *
    Math.max(barcodeSettings.elementSpacing, 0);

  const barcodeWidthPx =
    (contentWidthPx * barcodeSettings.barcodeWidthPercent) / 100;
  const reservedContentHeightPx =
    storeNameHeightPx +
    productNameHeightPx +
    barcodeNumberHeightPx +
    priceHeightPx +
    totalGapHeightPx;
  const availableHeightForBarcode = Math.max(
    contentHeightPx - reservedContentHeightPx,
    20,
  );
  const barcodeHeightPx = showBarcode
    ? Math.max(
        20,
        (availableHeightForBarcode * barcodeSettings.barcodeHeightPercent) /
          100,
      )
    : 0;

  const estimatedSymbols =
    Math.ceil(Math.max(normalizedCode.length, 1) / 2) + 3;
  const modulesPerSymbol = 11;
  const totalModules = estimatedSymbols * modulesPerSymbol;
  const calculatedBarWidth = Math.floor(barcodeWidthPx / totalModules);
  const barWidth = Math.max(
    1,
    Math.min(calculatedBarWidth, barcodeSettings.barWidth),
  );

  const container = document.createElement("div");
  container.classList.add("barcode-container");

  if (showStoreName) {
    const storeNameSpan = document.createElement("span");
    storeNameSpan.classList.add("text-line", "store-name");
    storeNameSpan.innerText = normalizedStoreName;
    container.appendChild(storeNameSpan);
  }

  if (showProductName) {
    const productNameSpan = document.createElement("span");
    productNameSpan.classList.add("text-line", "product-name");
    productNameSpan.innerText = normalizedProductName;
    container.appendChild(productNameSpan);
  }

  if (showBarcode) {
    const svg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    ) as SVGSVGElement;
    JsBarcode(svg, normalizedCode, {
      format: "CODE128",
      width: barWidth,
      height: barcodeHeightPx,
      fontSize: 0,
      displayValue: false,
      margin: 0,
      textMargin: 0,
    });
    const barcodeBlock = document.createElement("div");
    barcodeBlock.classList.add("barcode-block");
    barcodeBlock.appendChild(svg);

    if (showBarcodeNumber) {
      const barcodeNumberSpan = document.createElement("span");
      barcodeNumberSpan.classList.add("text-line", "barcode-number");
      barcodeNumberSpan.innerText = normalizedCode;
      barcodeBlock.appendChild(barcodeNumberSpan);
    }

    container.appendChild(barcodeBlock);
  } else if (showBarcodeNumber) {
    const barcodeBlock = document.createElement("div");
    barcodeBlock.classList.add("barcode-block");
    const barcodeNumberSpan = document.createElement("span");
    barcodeNumberSpan.classList.add("text-line", "barcode-number");
    barcodeNumberSpan.innerText = normalizedCode;
    barcodeBlock.appendChild(barcodeNumberSpan);
    container.appendChild(barcodeBlock);
  }

  if (showPrice) {
    const priceSpan = document.createElement("span");
    priceSpan.classList.add("text-line", "price");
    priceSpan.innerText = normalizedPriceText;
    container.appendChild(priceSpan);
  }

  const page = document.createElement("div");
  page.classList.add("barcode-page");
  page.appendChild(container);

  const style = buildBarcodeStyle({
    pageWidthPx,
    pageHeightPx,
    previewWidthPx,
    previewHeightPx,
    marginTopPx,
    marginBottomPx,
    marginLeftPx,
    marginRightPx,
    elementSpacing: barcodeSettings.elementSpacing,
    productNameFontSize: barcodeSettings.productNameFontSize,
    priceFontSize: barcodeSettings.priceFontSize,
    storeNameFontSize: barcodeSettings.storeNameFontSize,
    barcodeNumberFontSize: barcodeSettings.barcodeNumberFontSize,
    productNameOverflowMode: barcodeSettings.productNameOverflowMode,
    productNameLineCount,
    showBarcode,
    mode,
  });

  if (mode === "preview") {
    return `<style>${style}</style><div class="barcode-preview-root"><div class="barcode-preview-shell">${page.outerHTML}</div></div>`;
  }

  return `<style>${style}</style>${page.outerHTML}`;
};
