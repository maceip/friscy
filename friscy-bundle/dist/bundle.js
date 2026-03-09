"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/xterm/lib/xterm.js
  var require_xterm = __commonJS({
    "node_modules/xterm/lib/xterm.js"(exports, module) {
      !(function(e, t) {
        if ("object" == typeof exports && "object" == typeof module) module.exports = t();
        else if ("function" == typeof define && define.amd) define([], t);
        else {
          var i8 = t();
          for (var s in i8) ("object" == typeof exports ? exports : e)[s] = i8[s];
        }
      })(self, (() => (() => {
        "use strict";
        var e = { 4567: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.AccessibilityManager = void 0;
          const n = i9(9042), o2 = i9(6114), a = i9(9924), h2 = i9(844), c = i9(5596), l2 = i9(4725), d = i9(3656);
          let _4 = t2.AccessibilityManager = class extends h2.Disposable {
            constructor(e3, t3) {
              super(), this._terminal = e3, this._renderService = t3, this._liveRegionLineCount = 0, this._charsToConsume = [], this._charsToAnnounce = "", this._accessibilityContainer = document.createElement("div"), this._accessibilityContainer.classList.add("xterm-accessibility"), this._rowContainer = document.createElement("div"), this._rowContainer.setAttribute("role", "list"), this._rowContainer.classList.add("xterm-accessibility-tree"), this._rowElements = [];
              for (let e4 = 0; e4 < this._terminal.rows; e4++) this._rowElements[e4] = this._createAccessibilityTreeNode(), this._rowContainer.appendChild(this._rowElements[e4]);
              if (this._topBoundaryFocusListener = (e4) => this._handleBoundaryFocus(e4, 0), this._bottomBoundaryFocusListener = (e4) => this._handleBoundaryFocus(e4, 1), this._rowElements[0].addEventListener("focus", this._topBoundaryFocusListener), this._rowElements[this._rowElements.length - 1].addEventListener("focus", this._bottomBoundaryFocusListener), this._refreshRowsDimensions(), this._accessibilityContainer.appendChild(this._rowContainer), this._liveRegion = document.createElement("div"), this._liveRegion.classList.add("live-region"), this._liveRegion.setAttribute("aria-live", "assertive"), this._accessibilityContainer.appendChild(this._liveRegion), this._liveRegionDebouncer = this.register(new a.TimeBasedDebouncer(this._renderRows.bind(this))), !this._terminal.element) throw new Error("Cannot enable accessibility before Terminal.open");
              this._terminal.element.insertAdjacentElement("afterbegin", this._accessibilityContainer), this.register(this._terminal.onResize(((e4) => this._handleResize(e4.rows)))), this.register(this._terminal.onRender(((e4) => this._refreshRows(e4.start, e4.end)))), this.register(this._terminal.onScroll((() => this._refreshRows()))), this.register(this._terminal.onA11yChar(((e4) => this._handleChar(e4)))), this.register(this._terminal.onLineFeed((() => this._handleChar("\n")))), this.register(this._terminal.onA11yTab(((e4) => this._handleTab(e4)))), this.register(this._terminal.onKey(((e4) => this._handleKey(e4.key)))), this.register(this._terminal.onBlur((() => this._clearLiveRegion()))), this.register(this._renderService.onDimensionsChange((() => this._refreshRowsDimensions()))), this._screenDprMonitor = new c.ScreenDprMonitor(window), this.register(this._screenDprMonitor), this._screenDprMonitor.setListener((() => this._refreshRowsDimensions())), this.register((0, d.addDisposableDomListener)(window, "resize", (() => this._refreshRowsDimensions()))), this._refreshRows(), this.register((0, h2.toDisposable)((() => {
                this._accessibilityContainer.remove(), this._rowElements.length = 0;
              })));
            }
            _handleTab(e3) {
              for (let t3 = 0; t3 < e3; t3++) this._handleChar(" ");
            }
            _handleChar(e3) {
              this._liveRegionLineCount < 21 && (this._charsToConsume.length > 0 ? this._charsToConsume.shift() !== e3 && (this._charsToAnnounce += e3) : this._charsToAnnounce += e3, "\n" === e3 && (this._liveRegionLineCount++, 21 === this._liveRegionLineCount && (this._liveRegion.textContent += n.tooMuchOutput)), o2.isMac && this._liveRegion.textContent && this._liveRegion.textContent.length > 0 && !this._liveRegion.parentNode && setTimeout((() => {
                this._accessibilityContainer.appendChild(this._liveRegion);
              }), 0));
            }
            _clearLiveRegion() {
              this._liveRegion.textContent = "", this._liveRegionLineCount = 0, o2.isMac && this._liveRegion.remove();
            }
            _handleKey(e3) {
              this._clearLiveRegion(), /\p{Control}/u.test(e3) || this._charsToConsume.push(e3);
            }
            _refreshRows(e3, t3) {
              this._liveRegionDebouncer.refresh(e3, t3, this._terminal.rows);
            }
            _renderRows(e3, t3) {
              const i10 = this._terminal.buffer, s3 = i10.lines.length.toString();
              for (let r12 = e3; r12 <= t3; r12++) {
                const e4 = i10.translateBufferLineToString(i10.ydisp + r12, true), t4 = (i10.ydisp + r12 + 1).toString(), n2 = this._rowElements[r12];
                n2 && (0 === e4.length ? n2.innerText = "\xA0" : n2.textContent = e4, n2.setAttribute("aria-posinset", t4), n2.setAttribute("aria-setsize", s3));
              }
              this._announceCharacters();
            }
            _announceCharacters() {
              0 !== this._charsToAnnounce.length && (this._liveRegion.textContent += this._charsToAnnounce, this._charsToAnnounce = "");
            }
            _handleBoundaryFocus(e3, t3) {
              const i10 = e3.target, s3 = this._rowElements[0 === t3 ? 1 : this._rowElements.length - 2];
              if (i10.getAttribute("aria-posinset") === (0 === t3 ? "1" : `${this._terminal.buffer.lines.length}`)) return;
              if (e3.relatedTarget !== s3) return;
              let r12, n2;
              if (0 === t3 ? (r12 = i10, n2 = this._rowElements.pop(), this._rowContainer.removeChild(n2)) : (r12 = this._rowElements.shift(), n2 = i10, this._rowContainer.removeChild(r12)), r12.removeEventListener("focus", this._topBoundaryFocusListener), n2.removeEventListener("focus", this._bottomBoundaryFocusListener), 0 === t3) {
                const e4 = this._createAccessibilityTreeNode();
                this._rowElements.unshift(e4), this._rowContainer.insertAdjacentElement("afterbegin", e4);
              } else {
                const e4 = this._createAccessibilityTreeNode();
                this._rowElements.push(e4), this._rowContainer.appendChild(e4);
              }
              this._rowElements[0].addEventListener("focus", this._topBoundaryFocusListener), this._rowElements[this._rowElements.length - 1].addEventListener("focus", this._bottomBoundaryFocusListener), this._terminal.scrollLines(0 === t3 ? -1 : 1), this._rowElements[0 === t3 ? 1 : this._rowElements.length - 2].focus(), e3.preventDefault(), e3.stopImmediatePropagation();
            }
            _handleResize(e3) {
              this._rowElements[this._rowElements.length - 1].removeEventListener("focus", this._bottomBoundaryFocusListener);
              for (let e4 = this._rowContainer.children.length; e4 < this._terminal.rows; e4++) this._rowElements[e4] = this._createAccessibilityTreeNode(), this._rowContainer.appendChild(this._rowElements[e4]);
              for (; this._rowElements.length > e3; ) this._rowContainer.removeChild(this._rowElements.pop());
              this._rowElements[this._rowElements.length - 1].addEventListener("focus", this._bottomBoundaryFocusListener), this._refreshRowsDimensions();
            }
            _createAccessibilityTreeNode() {
              const e3 = document.createElement("div");
              return e3.setAttribute("role", "listitem"), e3.tabIndex = -1, this._refreshRowDimensions(e3), e3;
            }
            _refreshRowsDimensions() {
              if (this._renderService.dimensions.css.cell.height) {
                this._accessibilityContainer.style.width = `${this._renderService.dimensions.css.canvas.width}px`, this._rowElements.length !== this._terminal.rows && this._handleResize(this._terminal.rows);
                for (let e3 = 0; e3 < this._terminal.rows; e3++) this._refreshRowDimensions(this._rowElements[e3]);
              }
            }
            _refreshRowDimensions(e3) {
              e3.style.height = `${this._renderService.dimensions.css.cell.height}px`;
            }
          };
          t2.AccessibilityManager = _4 = s2([r11(1, l2.IRenderService)], _4);
        }, 3614: (e2, t2) => {
          function i9(e3) {
            return e3.replace(/\r?\n/g, "\r");
          }
          function s2(e3, t3) {
            return t3 ? "\x1B[200~" + e3 + "\x1B[201~" : e3;
          }
          function r11(e3, t3, r12, n2) {
            e3 = s2(e3 = i9(e3), r12.decPrivateModes.bracketedPasteMode && true !== n2.rawOptions.ignoreBracketedPasteMode), r12.triggerDataEvent(e3, true), t3.value = "";
          }
          function n(e3, t3, i10) {
            const s3 = i10.getBoundingClientRect(), r12 = e3.clientX - s3.left - 10, n2 = e3.clientY - s3.top - 10;
            t3.style.width = "20px", t3.style.height = "20px", t3.style.left = `${r12}px`, t3.style.top = `${n2}px`, t3.style.zIndex = "1000", t3.focus();
          }
          Object.defineProperty(t2, "__esModule", { value: true }), t2.rightClickHandler = t2.moveTextAreaUnderMouseCursor = t2.paste = t2.handlePasteEvent = t2.copyHandler = t2.bracketTextForPaste = t2.prepareTextForTerminal = void 0, t2.prepareTextForTerminal = i9, t2.bracketTextForPaste = s2, t2.copyHandler = function(e3, t3) {
            e3.clipboardData && e3.clipboardData.setData("text/plain", t3.selectionText), e3.preventDefault();
          }, t2.handlePasteEvent = function(e3, t3, i10, s3) {
            e3.stopPropagation(), e3.clipboardData && r11(e3.clipboardData.getData("text/plain"), t3, i10, s3);
          }, t2.paste = r11, t2.moveTextAreaUnderMouseCursor = n, t2.rightClickHandler = function(e3, t3, i10, s3, r12) {
            n(e3, t3, i10), r12 && s3.rightClickSelect(e3), t3.value = s3.selectionText, t3.select();
          };
        }, 7239: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.ColorContrastCache = void 0;
          const s2 = i9(1505);
          t2.ColorContrastCache = class {
            constructor() {
              this._color = new s2.TwoKeyMap(), this._css = new s2.TwoKeyMap();
            }
            setCss(e3, t3, i10) {
              this._css.set(e3, t3, i10);
            }
            getCss(e3, t3) {
              return this._css.get(e3, t3);
            }
            setColor(e3, t3, i10) {
              this._color.set(e3, t3, i10);
            }
            getColor(e3, t3) {
              return this._color.get(e3, t3);
            }
            clear() {
              this._color.clear(), this._css.clear();
            }
          };
        }, 3656: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.addDisposableDomListener = void 0, t2.addDisposableDomListener = function(e3, t3, i9, s2) {
            e3.addEventListener(t3, i9, s2);
            let r11 = false;
            return { dispose: () => {
              r11 || (r11 = true, e3.removeEventListener(t3, i9, s2));
            } };
          };
        }, 6465: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.Linkifier2 = void 0;
          const n = i9(3656), o2 = i9(8460), a = i9(844), h2 = i9(2585);
          let c = t2.Linkifier2 = class extends a.Disposable {
            get currentLink() {
              return this._currentLink;
            }
            constructor(e3) {
              super(), this._bufferService = e3, this._linkProviders = [], this._linkCacheDisposables = [], this._isMouseOut = true, this._wasResized = false, this._activeLine = -1, this._onShowLinkUnderline = this.register(new o2.EventEmitter()), this.onShowLinkUnderline = this._onShowLinkUnderline.event, this._onHideLinkUnderline = this.register(new o2.EventEmitter()), this.onHideLinkUnderline = this._onHideLinkUnderline.event, this.register((0, a.getDisposeArrayDisposable)(this._linkCacheDisposables)), this.register((0, a.toDisposable)((() => {
                this._lastMouseEvent = void 0;
              }))), this.register(this._bufferService.onResize((() => {
                this._clearCurrentLink(), this._wasResized = true;
              })));
            }
            registerLinkProvider(e3) {
              return this._linkProviders.push(e3), { dispose: () => {
                const t3 = this._linkProviders.indexOf(e3);
                -1 !== t3 && this._linkProviders.splice(t3, 1);
              } };
            }
            attachToDom(e3, t3, i10) {
              this._element = e3, this._mouseService = t3, this._renderService = i10, this.register((0, n.addDisposableDomListener)(this._element, "mouseleave", (() => {
                this._isMouseOut = true, this._clearCurrentLink();
              }))), this.register((0, n.addDisposableDomListener)(this._element, "mousemove", this._handleMouseMove.bind(this))), this.register((0, n.addDisposableDomListener)(this._element, "mousedown", this._handleMouseDown.bind(this))), this.register((0, n.addDisposableDomListener)(this._element, "mouseup", this._handleMouseUp.bind(this)));
            }
            _handleMouseMove(e3) {
              if (this._lastMouseEvent = e3, !this._element || !this._mouseService) return;
              const t3 = this._positionFromMouseEvent(e3, this._element, this._mouseService);
              if (!t3) return;
              this._isMouseOut = false;
              const i10 = e3.composedPath();
              for (let e4 = 0; e4 < i10.length; e4++) {
                const t4 = i10[e4];
                if (t4.classList.contains("xterm")) break;
                if (t4.classList.contains("xterm-hover")) return;
              }
              this._lastBufferCell && t3.x === this._lastBufferCell.x && t3.y === this._lastBufferCell.y || (this._handleHover(t3), this._lastBufferCell = t3);
            }
            _handleHover(e3) {
              if (this._activeLine !== e3.y || this._wasResized) return this._clearCurrentLink(), this._askForLink(e3, false), void (this._wasResized = false);
              this._currentLink && this._linkAtPosition(this._currentLink.link, e3) || (this._clearCurrentLink(), this._askForLink(e3, true));
            }
            _askForLink(e3, t3) {
              var i10, s3;
              this._activeProviderReplies && t3 || (null === (i10 = this._activeProviderReplies) || void 0 === i10 || i10.forEach(((e4) => {
                null == e4 || e4.forEach(((e5) => {
                  e5.link.dispose && e5.link.dispose();
                }));
              })), this._activeProviderReplies = /* @__PURE__ */ new Map(), this._activeLine = e3.y);
              let r12 = false;
              for (const [i11, n2] of this._linkProviders.entries()) t3 ? (null === (s3 = this._activeProviderReplies) || void 0 === s3 ? void 0 : s3.get(i11)) && (r12 = this._checkLinkProviderResult(i11, e3, r12)) : n2.provideLinks(e3.y, ((t4) => {
                var s4, n3;
                if (this._isMouseOut) return;
                const o3 = null == t4 ? void 0 : t4.map(((e4) => ({ link: e4 })));
                null === (s4 = this._activeProviderReplies) || void 0 === s4 || s4.set(i11, o3), r12 = this._checkLinkProviderResult(i11, e3, r12), (null === (n3 = this._activeProviderReplies) || void 0 === n3 ? void 0 : n3.size) === this._linkProviders.length && this._removeIntersectingLinks(e3.y, this._activeProviderReplies);
              }));
            }
            _removeIntersectingLinks(e3, t3) {
              const i10 = /* @__PURE__ */ new Set();
              for (let s3 = 0; s3 < t3.size; s3++) {
                const r12 = t3.get(s3);
                if (r12) for (let t4 = 0; t4 < r12.length; t4++) {
                  const s4 = r12[t4], n2 = s4.link.range.start.y < e3 ? 0 : s4.link.range.start.x, o3 = s4.link.range.end.y > e3 ? this._bufferService.cols : s4.link.range.end.x;
                  for (let e4 = n2; e4 <= o3; e4++) {
                    if (i10.has(e4)) {
                      r12.splice(t4--, 1);
                      break;
                    }
                    i10.add(e4);
                  }
                }
              }
            }
            _checkLinkProviderResult(e3, t3, i10) {
              var s3;
              if (!this._activeProviderReplies) return i10;
              const r12 = this._activeProviderReplies.get(e3);
              let n2 = false;
              for (let t4 = 0; t4 < e3; t4++) this._activeProviderReplies.has(t4) && !this._activeProviderReplies.get(t4) || (n2 = true);
              if (!n2 && r12) {
                const e4 = r12.find(((e5) => this._linkAtPosition(e5.link, t3)));
                e4 && (i10 = true, this._handleNewLink(e4));
              }
              if (this._activeProviderReplies.size === this._linkProviders.length && !i10) for (let e4 = 0; e4 < this._activeProviderReplies.size; e4++) {
                const r13 = null === (s3 = this._activeProviderReplies.get(e4)) || void 0 === s3 ? void 0 : s3.find(((e5) => this._linkAtPosition(e5.link, t3)));
                if (r13) {
                  i10 = true, this._handleNewLink(r13);
                  break;
                }
              }
              return i10;
            }
            _handleMouseDown() {
              this._mouseDownLink = this._currentLink;
            }
            _handleMouseUp(e3) {
              if (!this._element || !this._mouseService || !this._currentLink) return;
              const t3 = this._positionFromMouseEvent(e3, this._element, this._mouseService);
              t3 && this._mouseDownLink === this._currentLink && this._linkAtPosition(this._currentLink.link, t3) && this._currentLink.link.activate(e3, this._currentLink.link.text);
            }
            _clearCurrentLink(e3, t3) {
              this._element && this._currentLink && this._lastMouseEvent && (!e3 || !t3 || this._currentLink.link.range.start.y >= e3 && this._currentLink.link.range.end.y <= t3) && (this._linkLeave(this._element, this._currentLink.link, this._lastMouseEvent), this._currentLink = void 0, (0, a.disposeArray)(this._linkCacheDisposables));
            }
            _handleNewLink(e3) {
              if (!this._element || !this._lastMouseEvent || !this._mouseService) return;
              const t3 = this._positionFromMouseEvent(this._lastMouseEvent, this._element, this._mouseService);
              t3 && this._linkAtPosition(e3.link, t3) && (this._currentLink = e3, this._currentLink.state = { decorations: { underline: void 0 === e3.link.decorations || e3.link.decorations.underline, pointerCursor: void 0 === e3.link.decorations || e3.link.decorations.pointerCursor }, isHovered: true }, this._linkHover(this._element, e3.link, this._lastMouseEvent), e3.link.decorations = {}, Object.defineProperties(e3.link.decorations, { pointerCursor: { get: () => {
                var e4, t4;
                return null === (t4 = null === (e4 = this._currentLink) || void 0 === e4 ? void 0 : e4.state) || void 0 === t4 ? void 0 : t4.decorations.pointerCursor;
              }, set: (e4) => {
                var t4, i10;
                (null === (t4 = this._currentLink) || void 0 === t4 ? void 0 : t4.state) && this._currentLink.state.decorations.pointerCursor !== e4 && (this._currentLink.state.decorations.pointerCursor = e4, this._currentLink.state.isHovered && (null === (i10 = this._element) || void 0 === i10 || i10.classList.toggle("xterm-cursor-pointer", e4)));
              } }, underline: { get: () => {
                var e4, t4;
                return null === (t4 = null === (e4 = this._currentLink) || void 0 === e4 ? void 0 : e4.state) || void 0 === t4 ? void 0 : t4.decorations.underline;
              }, set: (t4) => {
                var i10, s3, r12;
                (null === (i10 = this._currentLink) || void 0 === i10 ? void 0 : i10.state) && (null === (r12 = null === (s3 = this._currentLink) || void 0 === s3 ? void 0 : s3.state) || void 0 === r12 ? void 0 : r12.decorations.underline) !== t4 && (this._currentLink.state.decorations.underline = t4, this._currentLink.state.isHovered && this._fireUnderlineEvent(e3.link, t4));
              } } }), this._renderService && this._linkCacheDisposables.push(this._renderService.onRenderedViewportChange(((e4) => {
                if (!this._currentLink) return;
                const t4 = 0 === e4.start ? 0 : e4.start + 1 + this._bufferService.buffer.ydisp, i10 = this._bufferService.buffer.ydisp + 1 + e4.end;
                if (this._currentLink.link.range.start.y >= t4 && this._currentLink.link.range.end.y <= i10 && (this._clearCurrentLink(t4, i10), this._lastMouseEvent && this._element)) {
                  const e5 = this._positionFromMouseEvent(this._lastMouseEvent, this._element, this._mouseService);
                  e5 && this._askForLink(e5, false);
                }
              }))));
            }
            _linkHover(e3, t3, i10) {
              var s3;
              (null === (s3 = this._currentLink) || void 0 === s3 ? void 0 : s3.state) && (this._currentLink.state.isHovered = true, this._currentLink.state.decorations.underline && this._fireUnderlineEvent(t3, true), this._currentLink.state.decorations.pointerCursor && e3.classList.add("xterm-cursor-pointer")), t3.hover && t3.hover(i10, t3.text);
            }
            _fireUnderlineEvent(e3, t3) {
              const i10 = e3.range, s3 = this._bufferService.buffer.ydisp, r12 = this._createLinkUnderlineEvent(i10.start.x - 1, i10.start.y - s3 - 1, i10.end.x, i10.end.y - s3 - 1, void 0);
              (t3 ? this._onShowLinkUnderline : this._onHideLinkUnderline).fire(r12);
            }
            _linkLeave(e3, t3, i10) {
              var s3;
              (null === (s3 = this._currentLink) || void 0 === s3 ? void 0 : s3.state) && (this._currentLink.state.isHovered = false, this._currentLink.state.decorations.underline && this._fireUnderlineEvent(t3, false), this._currentLink.state.decorations.pointerCursor && e3.classList.remove("xterm-cursor-pointer")), t3.leave && t3.leave(i10, t3.text);
            }
            _linkAtPosition(e3, t3) {
              const i10 = e3.range.start.y * this._bufferService.cols + e3.range.start.x, s3 = e3.range.end.y * this._bufferService.cols + e3.range.end.x, r12 = t3.y * this._bufferService.cols + t3.x;
              return i10 <= r12 && r12 <= s3;
            }
            _positionFromMouseEvent(e3, t3, i10) {
              const s3 = i10.getCoords(e3, t3, this._bufferService.cols, this._bufferService.rows);
              if (s3) return { x: s3[0], y: s3[1] + this._bufferService.buffer.ydisp };
            }
            _createLinkUnderlineEvent(e3, t3, i10, s3, r12) {
              return { x1: e3, y1: t3, x2: i10, y2: s3, cols: this._bufferService.cols, fg: r12 };
            }
          };
          t2.Linkifier2 = c = s2([r11(0, h2.IBufferService)], c);
        }, 9042: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.tooMuchOutput = t2.promptLabel = void 0, t2.promptLabel = "Terminal input", t2.tooMuchOutput = "Too much output to announce, navigate to rows manually to read";
        }, 3730: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.OscLinkProvider = void 0;
          const n = i9(511), o2 = i9(2585);
          let a = t2.OscLinkProvider = class {
            constructor(e3, t3, i10) {
              this._bufferService = e3, this._optionsService = t3, this._oscLinkService = i10;
            }
            provideLinks(e3, t3) {
              var i10;
              const s3 = this._bufferService.buffer.lines.get(e3 - 1);
              if (!s3) return void t3(void 0);
              const r12 = [], o3 = this._optionsService.rawOptions.linkHandler, a2 = new n.CellData(), c = s3.getTrimmedLength();
              let l2 = -1, d = -1, _4 = false;
              for (let t4 = 0; t4 < c; t4++) if (-1 !== d || s3.hasContent(t4)) {
                if (s3.loadCell(t4, a2), a2.hasExtendedAttrs() && a2.extended.urlId) {
                  if (-1 === d) {
                    d = t4, l2 = a2.extended.urlId;
                    continue;
                  }
                  _4 = a2.extended.urlId !== l2;
                } else -1 !== d && (_4 = true);
                if (_4 || -1 !== d && t4 === c - 1) {
                  const s4 = null === (i10 = this._oscLinkService.getLinkData(l2)) || void 0 === i10 ? void 0 : i10.uri;
                  if (s4) {
                    const i11 = { start: { x: d + 1, y: e3 }, end: { x: t4 + (_4 || t4 !== c - 1 ? 0 : 1), y: e3 } };
                    let n2 = false;
                    if (!(null == o3 ? void 0 : o3.allowNonHttpProtocols)) try {
                      const e4 = new URL(s4);
                      ["http:", "https:"].includes(e4.protocol) || (n2 = true);
                    } catch (e4) {
                      n2 = true;
                    }
                    n2 || r12.push({ text: s4, range: i11, activate: (e4, t5) => o3 ? o3.activate(e4, t5, i11) : h2(0, t5), hover: (e4, t5) => {
                      var s5;
                      return null === (s5 = null == o3 ? void 0 : o3.hover) || void 0 === s5 ? void 0 : s5.call(o3, e4, t5, i11);
                    }, leave: (e4, t5) => {
                      var s5;
                      return null === (s5 = null == o3 ? void 0 : o3.leave) || void 0 === s5 ? void 0 : s5.call(o3, e4, t5, i11);
                    } });
                  }
                  _4 = false, a2.hasExtendedAttrs() && a2.extended.urlId ? (d = t4, l2 = a2.extended.urlId) : (d = -1, l2 = -1);
                }
              }
              t3(r12);
            }
          };
          function h2(e3, t3) {
            if (confirm(`Do you want to navigate to ${t3}?

WARNING: This link could potentially be dangerous`)) {
              const e4 = window.open();
              if (e4) {
                try {
                  e4.opener = null;
                } catch (e5) {
                }
                e4.location.href = t3;
              } else console.warn("Opening link blocked as opener could not be cleared");
            }
          }
          t2.OscLinkProvider = a = s2([r11(0, o2.IBufferService), r11(1, o2.IOptionsService), r11(2, o2.IOscLinkService)], a);
        }, 6193: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.RenderDebouncer = void 0, t2.RenderDebouncer = class {
            constructor(e3, t3) {
              this._parentWindow = e3, this._renderCallback = t3, this._refreshCallbacks = [];
            }
            dispose() {
              this._animationFrame && (this._parentWindow.cancelAnimationFrame(this._animationFrame), this._animationFrame = void 0);
            }
            addRefreshCallback(e3) {
              return this._refreshCallbacks.push(e3), this._animationFrame || (this._animationFrame = this._parentWindow.requestAnimationFrame((() => this._innerRefresh()))), this._animationFrame;
            }
            refresh(e3, t3, i9) {
              this._rowCount = i9, e3 = void 0 !== e3 ? e3 : 0, t3 = void 0 !== t3 ? t3 : this._rowCount - 1, this._rowStart = void 0 !== this._rowStart ? Math.min(this._rowStart, e3) : e3, this._rowEnd = void 0 !== this._rowEnd ? Math.max(this._rowEnd, t3) : t3, this._animationFrame || (this._animationFrame = this._parentWindow.requestAnimationFrame((() => this._innerRefresh())));
            }
            _innerRefresh() {
              if (this._animationFrame = void 0, void 0 === this._rowStart || void 0 === this._rowEnd || void 0 === this._rowCount) return void this._runRefreshCallbacks();
              const e3 = Math.max(this._rowStart, 0), t3 = Math.min(this._rowEnd, this._rowCount - 1);
              this._rowStart = void 0, this._rowEnd = void 0, this._renderCallback(e3, t3), this._runRefreshCallbacks();
            }
            _runRefreshCallbacks() {
              for (const e3 of this._refreshCallbacks) e3(0);
              this._refreshCallbacks = [];
            }
          };
        }, 5596: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.ScreenDprMonitor = void 0;
          const s2 = i9(844);
          class r11 extends s2.Disposable {
            constructor(e3) {
              super(), this._parentWindow = e3, this._currentDevicePixelRatio = this._parentWindow.devicePixelRatio, this.register((0, s2.toDisposable)((() => {
                this.clearListener();
              })));
            }
            setListener(e3) {
              this._listener && this.clearListener(), this._listener = e3, this._outerListener = () => {
                this._listener && (this._listener(this._parentWindow.devicePixelRatio, this._currentDevicePixelRatio), this._updateDpr());
              }, this._updateDpr();
            }
            _updateDpr() {
              var e3;
              this._outerListener && (null === (e3 = this._resolutionMediaMatchList) || void 0 === e3 || e3.removeListener(this._outerListener), this._currentDevicePixelRatio = this._parentWindow.devicePixelRatio, this._resolutionMediaMatchList = this._parentWindow.matchMedia(`screen and (resolution: ${this._parentWindow.devicePixelRatio}dppx)`), this._resolutionMediaMatchList.addListener(this._outerListener));
            }
            clearListener() {
              this._resolutionMediaMatchList && this._listener && this._outerListener && (this._resolutionMediaMatchList.removeListener(this._outerListener), this._resolutionMediaMatchList = void 0, this._listener = void 0, this._outerListener = void 0);
            }
          }
          t2.ScreenDprMonitor = r11;
        }, 3236: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.Terminal = void 0;
          const s2 = i9(3614), r11 = i9(3656), n = i9(6465), o2 = i9(9042), a = i9(3730), h2 = i9(1680), c = i9(3107), l2 = i9(5744), d = i9(2950), _4 = i9(1296), u = i9(428), f = i9(4269), v3 = i9(5114), p = i9(8934), g2 = i9(3230), m = i9(9312), S2 = i9(4725), C4 = i9(6731), b = i9(8055), y = i9(8969), w4 = i9(8460), E = i9(844), k4 = i9(6114), L2 = i9(8437), D2 = i9(2584), R3 = i9(7399), x = i9(5941), A3 = i9(9074), B4 = i9(2585), T2 = i9(5435), M6 = i9(4567), O4 = "undefined" != typeof window ? window.document : null;
          class P5 extends y.CoreTerminal {
            get onFocus() {
              return this._onFocus.event;
            }
            get onBlur() {
              return this._onBlur.event;
            }
            get onA11yChar() {
              return this._onA11yCharEmitter.event;
            }
            get onA11yTab() {
              return this._onA11yTabEmitter.event;
            }
            get onWillOpen() {
              return this._onWillOpen.event;
            }
            constructor(e3 = {}) {
              super(e3), this.browser = k4, this._keyDownHandled = false, this._keyDownSeen = false, this._keyPressHandled = false, this._unprocessedDeadKey = false, this._accessibilityManager = this.register(new E.MutableDisposable()), this._onCursorMove = this.register(new w4.EventEmitter()), this.onCursorMove = this._onCursorMove.event, this._onKey = this.register(new w4.EventEmitter()), this.onKey = this._onKey.event, this._onRender = this.register(new w4.EventEmitter()), this.onRender = this._onRender.event, this._onSelectionChange = this.register(new w4.EventEmitter()), this.onSelectionChange = this._onSelectionChange.event, this._onTitleChange = this.register(new w4.EventEmitter()), this.onTitleChange = this._onTitleChange.event, this._onBell = this.register(new w4.EventEmitter()), this.onBell = this._onBell.event, this._onFocus = this.register(new w4.EventEmitter()), this._onBlur = this.register(new w4.EventEmitter()), this._onA11yCharEmitter = this.register(new w4.EventEmitter()), this._onA11yTabEmitter = this.register(new w4.EventEmitter()), this._onWillOpen = this.register(new w4.EventEmitter()), this._setup(), this.linkifier2 = this.register(this._instantiationService.createInstance(n.Linkifier2)), this.linkifier2.registerLinkProvider(this._instantiationService.createInstance(a.OscLinkProvider)), this._decorationService = this._instantiationService.createInstance(A3.DecorationService), this._instantiationService.setService(B4.IDecorationService, this._decorationService), this.register(this._inputHandler.onRequestBell((() => this._onBell.fire()))), this.register(this._inputHandler.onRequestRefreshRows(((e4, t3) => this.refresh(e4, t3)))), this.register(this._inputHandler.onRequestSendFocus((() => this._reportFocus()))), this.register(this._inputHandler.onRequestReset((() => this.reset()))), this.register(this._inputHandler.onRequestWindowsOptionsReport(((e4) => this._reportWindowsOptions(e4)))), this.register(this._inputHandler.onColor(((e4) => this._handleColorEvent(e4)))), this.register((0, w4.forwardEvent)(this._inputHandler.onCursorMove, this._onCursorMove)), this.register((0, w4.forwardEvent)(this._inputHandler.onTitleChange, this._onTitleChange)), this.register((0, w4.forwardEvent)(this._inputHandler.onA11yChar, this._onA11yCharEmitter)), this.register((0, w4.forwardEvent)(this._inputHandler.onA11yTab, this._onA11yTabEmitter)), this.register(this._bufferService.onResize(((e4) => this._afterResize(e4.cols, e4.rows)))), this.register((0, E.toDisposable)((() => {
                var e4, t3;
                this._customKeyEventHandler = void 0, null === (t3 = null === (e4 = this.element) || void 0 === e4 ? void 0 : e4.parentNode) || void 0 === t3 || t3.removeChild(this.element);
              })));
            }
            _handleColorEvent(e3) {
              if (this._themeService) for (const t3 of e3) {
                let e4, i10 = "";
                switch (t3.index) {
                  case 256:
                    e4 = "foreground", i10 = "10";
                    break;
                  case 257:
                    e4 = "background", i10 = "11";
                    break;
                  case 258:
                    e4 = "cursor", i10 = "12";
                    break;
                  default:
                    e4 = "ansi", i10 = "4;" + t3.index;
                }
                switch (t3.type) {
                  case 0:
                    const s3 = b.color.toColorRGB("ansi" === e4 ? this._themeService.colors.ansi[t3.index] : this._themeService.colors[e4]);
                    this.coreService.triggerDataEvent(`${D2.C0.ESC}]${i10};${(0, x.toRgbString)(s3)}${D2.C1_ESCAPED.ST}`);
                    break;
                  case 1:
                    if ("ansi" === e4) this._themeService.modifyColors(((e5) => e5.ansi[t3.index] = b.rgba.toColor(...t3.color)));
                    else {
                      const i11 = e4;
                      this._themeService.modifyColors(((e5) => e5[i11] = b.rgba.toColor(...t3.color)));
                    }
                    break;
                  case 2:
                    this._themeService.restoreColor(t3.index);
                }
              }
            }
            _setup() {
              super._setup(), this._customKeyEventHandler = void 0;
            }
            get buffer() {
              return this.buffers.active;
            }
            focus() {
              this.textarea && this.textarea.focus({ preventScroll: true });
            }
            _handleScreenReaderModeOptionChange(e3) {
              e3 ? !this._accessibilityManager.value && this._renderService && (this._accessibilityManager.value = this._instantiationService.createInstance(M6.AccessibilityManager, this)) : this._accessibilityManager.clear();
            }
            _handleTextAreaFocus(e3) {
              this.coreService.decPrivateModes.sendFocus && this.coreService.triggerDataEvent(D2.C0.ESC + "[I"), this.updateCursorStyle(e3), this.element.classList.add("focus"), this._showCursor(), this._onFocus.fire();
            }
            blur() {
              var e3;
              return null === (e3 = this.textarea) || void 0 === e3 ? void 0 : e3.blur();
            }
            _handleTextAreaBlur() {
              this.textarea.value = "", this.refresh(this.buffer.y, this.buffer.y), this.coreService.decPrivateModes.sendFocus && this.coreService.triggerDataEvent(D2.C0.ESC + "[O"), this.element.classList.remove("focus"), this._onBlur.fire();
            }
            _syncTextArea() {
              if (!this.textarea || !this.buffer.isCursorInViewport || this._compositionHelper.isComposing || !this._renderService) return;
              const e3 = this.buffer.ybase + this.buffer.y, t3 = this.buffer.lines.get(e3);
              if (!t3) return;
              const i10 = Math.min(this.buffer.x, this.cols - 1), s3 = this._renderService.dimensions.css.cell.height, r12 = t3.getWidth(i10), n2 = this._renderService.dimensions.css.cell.width * r12, o3 = this.buffer.y * this._renderService.dimensions.css.cell.height, a2 = i10 * this._renderService.dimensions.css.cell.width;
              this.textarea.style.left = a2 + "px", this.textarea.style.top = o3 + "px", this.textarea.style.width = n2 + "px", this.textarea.style.height = s3 + "px", this.textarea.style.lineHeight = s3 + "px", this.textarea.style.zIndex = "-5";
            }
            _initGlobal() {
              this._bindKeys(), this.register((0, r11.addDisposableDomListener)(this.element, "copy", ((e4) => {
                this.hasSelection() && (0, s2.copyHandler)(e4, this._selectionService);
              })));
              const e3 = (e4) => (0, s2.handlePasteEvent)(e4, this.textarea, this.coreService, this.optionsService);
              this.register((0, r11.addDisposableDomListener)(this.textarea, "paste", e3)), this.register((0, r11.addDisposableDomListener)(this.element, "paste", e3)), k4.isFirefox ? this.register((0, r11.addDisposableDomListener)(this.element, "mousedown", ((e4) => {
                2 === e4.button && (0, s2.rightClickHandler)(e4, this.textarea, this.screenElement, this._selectionService, this.options.rightClickSelectsWord);
              }))) : this.register((0, r11.addDisposableDomListener)(this.element, "contextmenu", ((e4) => {
                (0, s2.rightClickHandler)(e4, this.textarea, this.screenElement, this._selectionService, this.options.rightClickSelectsWord);
              }))), k4.isLinux && this.register((0, r11.addDisposableDomListener)(this.element, "auxclick", ((e4) => {
                1 === e4.button && (0, s2.moveTextAreaUnderMouseCursor)(e4, this.textarea, this.screenElement);
              })));
            }
            _bindKeys() {
              this.register((0, r11.addDisposableDomListener)(this.textarea, "keyup", ((e3) => this._keyUp(e3)), true)), this.register((0, r11.addDisposableDomListener)(this.textarea, "keydown", ((e3) => this._keyDown(e3)), true)), this.register((0, r11.addDisposableDomListener)(this.textarea, "keypress", ((e3) => this._keyPress(e3)), true)), this.register((0, r11.addDisposableDomListener)(this.textarea, "compositionstart", (() => this._compositionHelper.compositionstart()))), this.register((0, r11.addDisposableDomListener)(this.textarea, "compositionupdate", ((e3) => this._compositionHelper.compositionupdate(e3)))), this.register((0, r11.addDisposableDomListener)(this.textarea, "compositionend", (() => this._compositionHelper.compositionend()))), this.register((0, r11.addDisposableDomListener)(this.textarea, "input", ((e3) => this._inputEvent(e3)), true)), this.register(this.onRender((() => this._compositionHelper.updateCompositionElements())));
            }
            open(e3) {
              var t3;
              if (!e3) throw new Error("Terminal requires a parent element.");
              e3.isConnected || this._logService.debug("Terminal.open was called on an element that was not attached to the DOM"), this._document = e3.ownerDocument, this.element = this._document.createElement("div"), this.element.dir = "ltr", this.element.classList.add("terminal"), this.element.classList.add("xterm"), e3.appendChild(this.element);
              const i10 = O4.createDocumentFragment();
              this._viewportElement = O4.createElement("div"), this._viewportElement.classList.add("xterm-viewport"), i10.appendChild(this._viewportElement), this._viewportScrollArea = O4.createElement("div"), this._viewportScrollArea.classList.add("xterm-scroll-area"), this._viewportElement.appendChild(this._viewportScrollArea), this.screenElement = O4.createElement("div"), this.screenElement.classList.add("xterm-screen"), this._helperContainer = O4.createElement("div"), this._helperContainer.classList.add("xterm-helpers"), this.screenElement.appendChild(this._helperContainer), i10.appendChild(this.screenElement), this.textarea = O4.createElement("textarea"), this.textarea.classList.add("xterm-helper-textarea"), this.textarea.setAttribute("aria-label", o2.promptLabel), k4.isChromeOS || this.textarea.setAttribute("aria-multiline", "false"), this.textarea.setAttribute("autocorrect", "off"), this.textarea.setAttribute("autocapitalize", "off"), this.textarea.setAttribute("spellcheck", "false"), this.textarea.tabIndex = 0, this._coreBrowserService = this._instantiationService.createInstance(v3.CoreBrowserService, this.textarea, null !== (t3 = this._document.defaultView) && void 0 !== t3 ? t3 : window), this._instantiationService.setService(S2.ICoreBrowserService, this._coreBrowserService), this.register((0, r11.addDisposableDomListener)(this.textarea, "focus", ((e4) => this._handleTextAreaFocus(e4)))), this.register((0, r11.addDisposableDomListener)(this.textarea, "blur", (() => this._handleTextAreaBlur()))), this._helperContainer.appendChild(this.textarea), this._charSizeService = this._instantiationService.createInstance(u.CharSizeService, this._document, this._helperContainer), this._instantiationService.setService(S2.ICharSizeService, this._charSizeService), this._themeService = this._instantiationService.createInstance(C4.ThemeService), this._instantiationService.setService(S2.IThemeService, this._themeService), this._characterJoinerService = this._instantiationService.createInstance(f.CharacterJoinerService), this._instantiationService.setService(S2.ICharacterJoinerService, this._characterJoinerService), this._renderService = this.register(this._instantiationService.createInstance(g2.RenderService, this.rows, this.screenElement)), this._instantiationService.setService(S2.IRenderService, this._renderService), this.register(this._renderService.onRenderedViewportChange(((e4) => this._onRender.fire(e4)))), this.onResize(((e4) => this._renderService.resize(e4.cols, e4.rows))), this._compositionView = O4.createElement("div"), this._compositionView.classList.add("composition-view"), this._compositionHelper = this._instantiationService.createInstance(d.CompositionHelper, this.textarea, this._compositionView), this._helperContainer.appendChild(this._compositionView), this.element.appendChild(i10);
              try {
                this._onWillOpen.fire(this.element);
              } catch (e4) {
              }
              this._renderService.hasRenderer() || this._renderService.setRenderer(this._createRenderer()), this._mouseService = this._instantiationService.createInstance(p.MouseService), this._instantiationService.setService(S2.IMouseService, this._mouseService), this.viewport = this._instantiationService.createInstance(h2.Viewport, this._viewportElement, this._viewportScrollArea), this.viewport.onRequestScrollLines(((e4) => this.scrollLines(e4.amount, e4.suppressScrollEvent, 1))), this.register(this._inputHandler.onRequestSyncScrollBar((() => this.viewport.syncScrollArea()))), this.register(this.viewport), this.register(this.onCursorMove((() => {
                this._renderService.handleCursorMove(), this._syncTextArea();
              }))), this.register(this.onResize((() => this._renderService.handleResize(this.cols, this.rows)))), this.register(this.onBlur((() => this._renderService.handleBlur()))), this.register(this.onFocus((() => this._renderService.handleFocus()))), this.register(this._renderService.onDimensionsChange((() => this.viewport.syncScrollArea()))), this._selectionService = this.register(this._instantiationService.createInstance(m.SelectionService, this.element, this.screenElement, this.linkifier2)), this._instantiationService.setService(S2.ISelectionService, this._selectionService), this.register(this._selectionService.onRequestScrollLines(((e4) => this.scrollLines(e4.amount, e4.suppressScrollEvent)))), this.register(this._selectionService.onSelectionChange((() => this._onSelectionChange.fire()))), this.register(this._selectionService.onRequestRedraw(((e4) => this._renderService.handleSelectionChanged(e4.start, e4.end, e4.columnSelectMode)))), this.register(this._selectionService.onLinuxMouseSelection(((e4) => {
                this.textarea.value = e4, this.textarea.focus(), this.textarea.select();
              }))), this.register(this._onScroll.event(((e4) => {
                this.viewport.syncScrollArea(), this._selectionService.refresh();
              }))), this.register((0, r11.addDisposableDomListener)(this._viewportElement, "scroll", (() => this._selectionService.refresh()))), this.linkifier2.attachToDom(this.screenElement, this._mouseService, this._renderService), this.register(this._instantiationService.createInstance(c.BufferDecorationRenderer, this.screenElement)), this.register((0, r11.addDisposableDomListener)(this.element, "mousedown", ((e4) => this._selectionService.handleMouseDown(e4)))), this.coreMouseService.areMouseEventsActive ? (this._selectionService.disable(), this.element.classList.add("enable-mouse-events")) : this._selectionService.enable(), this.options.screenReaderMode && (this._accessibilityManager.value = this._instantiationService.createInstance(M6.AccessibilityManager, this)), this.register(this.optionsService.onSpecificOptionChange("screenReaderMode", ((e4) => this._handleScreenReaderModeOptionChange(e4)))), this.options.overviewRulerWidth && (this._overviewRulerRenderer = this.register(this._instantiationService.createInstance(l2.OverviewRulerRenderer, this._viewportElement, this.screenElement))), this.optionsService.onSpecificOptionChange("overviewRulerWidth", ((e4) => {
                !this._overviewRulerRenderer && e4 && this._viewportElement && this.screenElement && (this._overviewRulerRenderer = this.register(this._instantiationService.createInstance(l2.OverviewRulerRenderer, this._viewportElement, this.screenElement)));
              })), this._charSizeService.measure(), this.refresh(0, this.rows - 1), this._initGlobal(), this.bindMouse();
            }
            _createRenderer() {
              return this._instantiationService.createInstance(_4.DomRenderer, this.element, this.screenElement, this._viewportElement, this.linkifier2);
            }
            bindMouse() {
              const e3 = this, t3 = this.element;
              function i10(t4) {
                const i11 = e3._mouseService.getMouseReportCoords(t4, e3.screenElement);
                if (!i11) return false;
                let s4, r12;
                switch (t4.overrideType || t4.type) {
                  case "mousemove":
                    r12 = 32, void 0 === t4.buttons ? (s4 = 3, void 0 !== t4.button && (s4 = t4.button < 3 ? t4.button : 3)) : s4 = 1 & t4.buttons ? 0 : 4 & t4.buttons ? 1 : 2 & t4.buttons ? 2 : 3;
                    break;
                  case "mouseup":
                    r12 = 0, s4 = t4.button < 3 ? t4.button : 3;
                    break;
                  case "mousedown":
                    r12 = 1, s4 = t4.button < 3 ? t4.button : 3;
                    break;
                  case "wheel":
                    if (0 === e3.viewport.getLinesScrolled(t4)) return false;
                    r12 = t4.deltaY < 0 ? 0 : 1, s4 = 4;
                    break;
                  default:
                    return false;
                }
                return !(void 0 === r12 || void 0 === s4 || s4 > 4) && e3.coreMouseService.triggerMouseEvent({ col: i11.col, row: i11.row, x: i11.x, y: i11.y, button: s4, action: r12, ctrl: t4.ctrlKey, alt: t4.altKey, shift: t4.shiftKey });
              }
              const s3 = { mouseup: null, wheel: null, mousedrag: null, mousemove: null }, n2 = { mouseup: (e4) => (i10(e4), e4.buttons || (this._document.removeEventListener("mouseup", s3.mouseup), s3.mousedrag && this._document.removeEventListener("mousemove", s3.mousedrag)), this.cancel(e4)), wheel: (e4) => (i10(e4), this.cancel(e4, true)), mousedrag: (e4) => {
                e4.buttons && i10(e4);
              }, mousemove: (e4) => {
                e4.buttons || i10(e4);
              } };
              this.register(this.coreMouseService.onProtocolChange(((e4) => {
                e4 ? ("debug" === this.optionsService.rawOptions.logLevel && this._logService.debug("Binding to mouse events:", this.coreMouseService.explainEvents(e4)), this.element.classList.add("enable-mouse-events"), this._selectionService.disable()) : (this._logService.debug("Unbinding from mouse events."), this.element.classList.remove("enable-mouse-events"), this._selectionService.enable()), 8 & e4 ? s3.mousemove || (t3.addEventListener("mousemove", n2.mousemove), s3.mousemove = n2.mousemove) : (t3.removeEventListener("mousemove", s3.mousemove), s3.mousemove = null), 16 & e4 ? s3.wheel || (t3.addEventListener("wheel", n2.wheel, { passive: false }), s3.wheel = n2.wheel) : (t3.removeEventListener("wheel", s3.wheel), s3.wheel = null), 2 & e4 ? s3.mouseup || (t3.addEventListener("mouseup", n2.mouseup), s3.mouseup = n2.mouseup) : (this._document.removeEventListener("mouseup", s3.mouseup), t3.removeEventListener("mouseup", s3.mouseup), s3.mouseup = null), 4 & e4 ? s3.mousedrag || (s3.mousedrag = n2.mousedrag) : (this._document.removeEventListener("mousemove", s3.mousedrag), s3.mousedrag = null);
              }))), this.coreMouseService.activeProtocol = this.coreMouseService.activeProtocol, this.register((0, r11.addDisposableDomListener)(t3, "mousedown", ((e4) => {
                if (e4.preventDefault(), this.focus(), this.coreMouseService.areMouseEventsActive && !this._selectionService.shouldForceSelection(e4)) return i10(e4), s3.mouseup && this._document.addEventListener("mouseup", s3.mouseup), s3.mousedrag && this._document.addEventListener("mousemove", s3.mousedrag), this.cancel(e4);
              }))), this.register((0, r11.addDisposableDomListener)(t3, "wheel", ((e4) => {
                if (!s3.wheel) {
                  if (!this.buffer.hasScrollback) {
                    const t4 = this.viewport.getLinesScrolled(e4);
                    if (0 === t4) return;
                    const i11 = D2.C0.ESC + (this.coreService.decPrivateModes.applicationCursorKeys ? "O" : "[") + (e4.deltaY < 0 ? "A" : "B");
                    let s4 = "";
                    for (let e5 = 0; e5 < Math.abs(t4); e5++) s4 += i11;
                    return this.coreService.triggerDataEvent(s4, true), this.cancel(e4, true);
                  }
                  return this.viewport.handleWheel(e4) ? this.cancel(e4) : void 0;
                }
              }), { passive: false })), this.register((0, r11.addDisposableDomListener)(t3, "touchstart", ((e4) => {
                if (!this.coreMouseService.areMouseEventsActive) return this.viewport.handleTouchStart(e4), this.cancel(e4);
              }), { passive: true })), this.register((0, r11.addDisposableDomListener)(t3, "touchmove", ((e4) => {
                if (!this.coreMouseService.areMouseEventsActive) return this.viewport.handleTouchMove(e4) ? void 0 : this.cancel(e4);
              }), { passive: false }));
            }
            refresh(e3, t3) {
              var i10;
              null === (i10 = this._renderService) || void 0 === i10 || i10.refreshRows(e3, t3);
            }
            updateCursorStyle(e3) {
              var t3;
              (null === (t3 = this._selectionService) || void 0 === t3 ? void 0 : t3.shouldColumnSelect(e3)) ? this.element.classList.add("column-select") : this.element.classList.remove("column-select");
            }
            _showCursor() {
              this.coreService.isCursorInitialized || (this.coreService.isCursorInitialized = true, this.refresh(this.buffer.y, this.buffer.y));
            }
            scrollLines(e3, t3, i10 = 0) {
              var s3;
              1 === i10 ? (super.scrollLines(e3, t3, i10), this.refresh(0, this.rows - 1)) : null === (s3 = this.viewport) || void 0 === s3 || s3.scrollLines(e3);
            }
            paste(e3) {
              (0, s2.paste)(e3, this.textarea, this.coreService, this.optionsService);
            }
            attachCustomKeyEventHandler(e3) {
              this._customKeyEventHandler = e3;
            }
            registerLinkProvider(e3) {
              return this.linkifier2.registerLinkProvider(e3);
            }
            registerCharacterJoiner(e3) {
              if (!this._characterJoinerService) throw new Error("Terminal must be opened first");
              const t3 = this._characterJoinerService.register(e3);
              return this.refresh(0, this.rows - 1), t3;
            }
            deregisterCharacterJoiner(e3) {
              if (!this._characterJoinerService) throw new Error("Terminal must be opened first");
              this._characterJoinerService.deregister(e3) && this.refresh(0, this.rows - 1);
            }
            get markers() {
              return this.buffer.markers;
            }
            registerMarker(e3) {
              return this.buffer.addMarker(this.buffer.ybase + this.buffer.y + e3);
            }
            registerDecoration(e3) {
              return this._decorationService.registerDecoration(e3);
            }
            hasSelection() {
              return !!this._selectionService && this._selectionService.hasSelection;
            }
            select(e3, t3, i10) {
              this._selectionService.setSelection(e3, t3, i10);
            }
            getSelection() {
              return this._selectionService ? this._selectionService.selectionText : "";
            }
            getSelectionPosition() {
              if (this._selectionService && this._selectionService.hasSelection) return { start: { x: this._selectionService.selectionStart[0], y: this._selectionService.selectionStart[1] }, end: { x: this._selectionService.selectionEnd[0], y: this._selectionService.selectionEnd[1] } };
            }
            clearSelection() {
              var e3;
              null === (e3 = this._selectionService) || void 0 === e3 || e3.clearSelection();
            }
            selectAll() {
              var e3;
              null === (e3 = this._selectionService) || void 0 === e3 || e3.selectAll();
            }
            selectLines(e3, t3) {
              var i10;
              null === (i10 = this._selectionService) || void 0 === i10 || i10.selectLines(e3, t3);
            }
            _keyDown(e3) {
              if (this._keyDownHandled = false, this._keyDownSeen = true, this._customKeyEventHandler && false === this._customKeyEventHandler(e3)) return false;
              const t3 = this.browser.isMac && this.options.macOptionIsMeta && e3.altKey;
              if (!t3 && !this._compositionHelper.keydown(e3)) return this.options.scrollOnUserInput && this.buffer.ybase !== this.buffer.ydisp && this.scrollToBottom(), false;
              t3 || "Dead" !== e3.key && "AltGraph" !== e3.key || (this._unprocessedDeadKey = true);
              const i10 = (0, R3.evaluateKeyboardEvent)(e3, this.coreService.decPrivateModes.applicationCursorKeys, this.browser.isMac, this.options.macOptionIsMeta);
              if (this.updateCursorStyle(e3), 3 === i10.type || 2 === i10.type) {
                const t4 = this.rows - 1;
                return this.scrollLines(2 === i10.type ? -t4 : t4), this.cancel(e3, true);
              }
              return 1 === i10.type && this.selectAll(), !!this._isThirdLevelShift(this.browser, e3) || (i10.cancel && this.cancel(e3, true), !i10.key || !!(e3.key && !e3.ctrlKey && !e3.altKey && !e3.metaKey && 1 === e3.key.length && e3.key.charCodeAt(0) >= 65 && e3.key.charCodeAt(0) <= 90) || (this._unprocessedDeadKey ? (this._unprocessedDeadKey = false, true) : (i10.key !== D2.C0.ETX && i10.key !== D2.C0.CR || (this.textarea.value = ""), this._onKey.fire({ key: i10.key, domEvent: e3 }), this._showCursor(), this.coreService.triggerDataEvent(i10.key, true), !this.optionsService.rawOptions.screenReaderMode || e3.altKey || e3.ctrlKey ? this.cancel(e3, true) : void (this._keyDownHandled = true))));
            }
            _isThirdLevelShift(e3, t3) {
              const i10 = e3.isMac && !this.options.macOptionIsMeta && t3.altKey && !t3.ctrlKey && !t3.metaKey || e3.isWindows && t3.altKey && t3.ctrlKey && !t3.metaKey || e3.isWindows && t3.getModifierState("AltGraph");
              return "keypress" === t3.type ? i10 : i10 && (!t3.keyCode || t3.keyCode > 47);
            }
            _keyUp(e3) {
              this._keyDownSeen = false, this._customKeyEventHandler && false === this._customKeyEventHandler(e3) || ((function(e4) {
                return 16 === e4.keyCode || 17 === e4.keyCode || 18 === e4.keyCode;
              })(e3) || this.focus(), this.updateCursorStyle(e3), this._keyPressHandled = false);
            }
            _keyPress(e3) {
              let t3;
              if (this._keyPressHandled = false, this._keyDownHandled) return false;
              if (this._customKeyEventHandler && false === this._customKeyEventHandler(e3)) return false;
              if (this.cancel(e3), e3.charCode) t3 = e3.charCode;
              else if (null === e3.which || void 0 === e3.which) t3 = e3.keyCode;
              else {
                if (0 === e3.which || 0 === e3.charCode) return false;
                t3 = e3.which;
              }
              return !(!t3 || (e3.altKey || e3.ctrlKey || e3.metaKey) && !this._isThirdLevelShift(this.browser, e3) || (t3 = String.fromCharCode(t3), this._onKey.fire({ key: t3, domEvent: e3 }), this._showCursor(), this.coreService.triggerDataEvent(t3, true), this._keyPressHandled = true, this._unprocessedDeadKey = false, 0));
            }
            _inputEvent(e3) {
              if (e3.data && "insertText" === e3.inputType && (!e3.composed || !this._keyDownSeen) && !this.optionsService.rawOptions.screenReaderMode) {
                if (this._keyPressHandled) return false;
                this._unprocessedDeadKey = false;
                const t3 = e3.data;
                return this.coreService.triggerDataEvent(t3, true), this.cancel(e3), true;
              }
              return false;
            }
            resize(e3, t3) {
              e3 !== this.cols || t3 !== this.rows ? super.resize(e3, t3) : this._charSizeService && !this._charSizeService.hasValidSize && this._charSizeService.measure();
            }
            _afterResize(e3, t3) {
              var i10, s3;
              null === (i10 = this._charSizeService) || void 0 === i10 || i10.measure(), null === (s3 = this.viewport) || void 0 === s3 || s3.syncScrollArea(true);
            }
            clear() {
              var e3;
              if (0 !== this.buffer.ybase || 0 !== this.buffer.y) {
                this.buffer.clearAllMarkers(), this.buffer.lines.set(0, this.buffer.lines.get(this.buffer.ybase + this.buffer.y)), this.buffer.lines.length = 1, this.buffer.ydisp = 0, this.buffer.ybase = 0, this.buffer.y = 0;
                for (let e4 = 1; e4 < this.rows; e4++) this.buffer.lines.push(this.buffer.getBlankLine(L2.DEFAULT_ATTR_DATA));
                this._onScroll.fire({ position: this.buffer.ydisp, source: 0 }), null === (e3 = this.viewport) || void 0 === e3 || e3.reset(), this.refresh(0, this.rows - 1);
              }
            }
            reset() {
              var e3, t3;
              this.options.rows = this.rows, this.options.cols = this.cols;
              const i10 = this._customKeyEventHandler;
              this._setup(), super.reset(), null === (e3 = this._selectionService) || void 0 === e3 || e3.reset(), this._decorationService.reset(), null === (t3 = this.viewport) || void 0 === t3 || t3.reset(), this._customKeyEventHandler = i10, this.refresh(0, this.rows - 1);
            }
            clearTextureAtlas() {
              var e3;
              null === (e3 = this._renderService) || void 0 === e3 || e3.clearTextureAtlas();
            }
            _reportFocus() {
              var e3;
              (null === (e3 = this.element) || void 0 === e3 ? void 0 : e3.classList.contains("focus")) ? this.coreService.triggerDataEvent(D2.C0.ESC + "[I") : this.coreService.triggerDataEvent(D2.C0.ESC + "[O");
            }
            _reportWindowsOptions(e3) {
              if (this._renderService) switch (e3) {
                case T2.WindowsOptionsReportType.GET_WIN_SIZE_PIXELS:
                  const e4 = this._renderService.dimensions.css.canvas.width.toFixed(0), t3 = this._renderService.dimensions.css.canvas.height.toFixed(0);
                  this.coreService.triggerDataEvent(`${D2.C0.ESC}[4;${t3};${e4}t`);
                  break;
                case T2.WindowsOptionsReportType.GET_CELL_SIZE_PIXELS:
                  const i10 = this._renderService.dimensions.css.cell.width.toFixed(0), s3 = this._renderService.dimensions.css.cell.height.toFixed(0);
                  this.coreService.triggerDataEvent(`${D2.C0.ESC}[6;${s3};${i10}t`);
              }
            }
            cancel(e3, t3) {
              if (this.options.cancelEvents || t3) return e3.preventDefault(), e3.stopPropagation(), false;
            }
          }
          t2.Terminal = P5;
        }, 9924: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.TimeBasedDebouncer = void 0, t2.TimeBasedDebouncer = class {
            constructor(e3, t3 = 1e3) {
              this._renderCallback = e3, this._debounceThresholdMS = t3, this._lastRefreshMs = 0, this._additionalRefreshRequested = false;
            }
            dispose() {
              this._refreshTimeoutID && clearTimeout(this._refreshTimeoutID);
            }
            refresh(e3, t3, i9) {
              this._rowCount = i9, e3 = void 0 !== e3 ? e3 : 0, t3 = void 0 !== t3 ? t3 : this._rowCount - 1, this._rowStart = void 0 !== this._rowStart ? Math.min(this._rowStart, e3) : e3, this._rowEnd = void 0 !== this._rowEnd ? Math.max(this._rowEnd, t3) : t3;
              const s2 = Date.now();
              if (s2 - this._lastRefreshMs >= this._debounceThresholdMS) this._lastRefreshMs = s2, this._innerRefresh();
              else if (!this._additionalRefreshRequested) {
                const e4 = s2 - this._lastRefreshMs, t4 = this._debounceThresholdMS - e4;
                this._additionalRefreshRequested = true, this._refreshTimeoutID = window.setTimeout((() => {
                  this._lastRefreshMs = Date.now(), this._innerRefresh(), this._additionalRefreshRequested = false, this._refreshTimeoutID = void 0;
                }), t4);
              }
            }
            _innerRefresh() {
              if (void 0 === this._rowStart || void 0 === this._rowEnd || void 0 === this._rowCount) return;
              const e3 = Math.max(this._rowStart, 0), t3 = Math.min(this._rowEnd, this._rowCount - 1);
              this._rowStart = void 0, this._rowEnd = void 0, this._renderCallback(e3, t3);
            }
          };
        }, 1680: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.Viewport = void 0;
          const n = i9(3656), o2 = i9(4725), a = i9(8460), h2 = i9(844), c = i9(2585);
          let l2 = t2.Viewport = class extends h2.Disposable {
            constructor(e3, t3, i10, s3, r12, o3, h3, c2) {
              super(), this._viewportElement = e3, this._scrollArea = t3, this._bufferService = i10, this._optionsService = s3, this._charSizeService = r12, this._renderService = o3, this._coreBrowserService = h3, this.scrollBarWidth = 0, this._currentRowHeight = 0, this._currentDeviceCellHeight = 0, this._lastRecordedBufferLength = 0, this._lastRecordedViewportHeight = 0, this._lastRecordedBufferHeight = 0, this._lastTouchY = 0, this._lastScrollTop = 0, this._wheelPartialScroll = 0, this._refreshAnimationFrame = null, this._ignoreNextScrollEvent = false, this._smoothScrollState = { startTime: 0, origin: -1, target: -1 }, this._onRequestScrollLines = this.register(new a.EventEmitter()), this.onRequestScrollLines = this._onRequestScrollLines.event, this.scrollBarWidth = this._viewportElement.offsetWidth - this._scrollArea.offsetWidth || 15, this.register((0, n.addDisposableDomListener)(this._viewportElement, "scroll", this._handleScroll.bind(this))), this._activeBuffer = this._bufferService.buffer, this.register(this._bufferService.buffers.onBufferActivate(((e4) => this._activeBuffer = e4.activeBuffer))), this._renderDimensions = this._renderService.dimensions, this.register(this._renderService.onDimensionsChange(((e4) => this._renderDimensions = e4))), this._handleThemeChange(c2.colors), this.register(c2.onChangeColors(((e4) => this._handleThemeChange(e4)))), this.register(this._optionsService.onSpecificOptionChange("scrollback", (() => this.syncScrollArea()))), setTimeout((() => this.syncScrollArea()));
            }
            _handleThemeChange(e3) {
              this._viewportElement.style.backgroundColor = e3.background.css;
            }
            reset() {
              this._currentRowHeight = 0, this._currentDeviceCellHeight = 0, this._lastRecordedBufferLength = 0, this._lastRecordedViewportHeight = 0, this._lastRecordedBufferHeight = 0, this._lastTouchY = 0, this._lastScrollTop = 0, this._coreBrowserService.window.requestAnimationFrame((() => this.syncScrollArea()));
            }
            _refresh(e3) {
              if (e3) return this._innerRefresh(), void (null !== this._refreshAnimationFrame && this._coreBrowserService.window.cancelAnimationFrame(this._refreshAnimationFrame));
              null === this._refreshAnimationFrame && (this._refreshAnimationFrame = this._coreBrowserService.window.requestAnimationFrame((() => this._innerRefresh())));
            }
            _innerRefresh() {
              if (this._charSizeService.height > 0) {
                this._currentRowHeight = this._renderService.dimensions.device.cell.height / this._coreBrowserService.dpr, this._currentDeviceCellHeight = this._renderService.dimensions.device.cell.height, this._lastRecordedViewportHeight = this._viewportElement.offsetHeight;
                const e4 = Math.round(this._currentRowHeight * this._lastRecordedBufferLength) + (this._lastRecordedViewportHeight - this._renderService.dimensions.css.canvas.height);
                this._lastRecordedBufferHeight !== e4 && (this._lastRecordedBufferHeight = e4, this._scrollArea.style.height = this._lastRecordedBufferHeight + "px");
              }
              const e3 = this._bufferService.buffer.ydisp * this._currentRowHeight;
              this._viewportElement.scrollTop !== e3 && (this._ignoreNextScrollEvent = true, this._viewportElement.scrollTop = e3), this._refreshAnimationFrame = null;
            }
            syncScrollArea(e3 = false) {
              if (this._lastRecordedBufferLength !== this._bufferService.buffer.lines.length) return this._lastRecordedBufferLength = this._bufferService.buffer.lines.length, void this._refresh(e3);
              this._lastRecordedViewportHeight === this._renderService.dimensions.css.canvas.height && this._lastScrollTop === this._activeBuffer.ydisp * this._currentRowHeight && this._renderDimensions.device.cell.height === this._currentDeviceCellHeight || this._refresh(e3);
            }
            _handleScroll(e3) {
              if (this._lastScrollTop = this._viewportElement.scrollTop, !this._viewportElement.offsetParent) return;
              if (this._ignoreNextScrollEvent) return this._ignoreNextScrollEvent = false, void this._onRequestScrollLines.fire({ amount: 0, suppressScrollEvent: true });
              const t3 = Math.round(this._lastScrollTop / this._currentRowHeight) - this._bufferService.buffer.ydisp;
              this._onRequestScrollLines.fire({ amount: t3, suppressScrollEvent: true });
            }
            _smoothScroll() {
              if (this._isDisposed || -1 === this._smoothScrollState.origin || -1 === this._smoothScrollState.target) return;
              const e3 = this._smoothScrollPercent();
              this._viewportElement.scrollTop = this._smoothScrollState.origin + Math.round(e3 * (this._smoothScrollState.target - this._smoothScrollState.origin)), e3 < 1 ? this._coreBrowserService.window.requestAnimationFrame((() => this._smoothScroll())) : this._clearSmoothScrollState();
            }
            _smoothScrollPercent() {
              return this._optionsService.rawOptions.smoothScrollDuration && this._smoothScrollState.startTime ? Math.max(Math.min((Date.now() - this._smoothScrollState.startTime) / this._optionsService.rawOptions.smoothScrollDuration, 1), 0) : 1;
            }
            _clearSmoothScrollState() {
              this._smoothScrollState.startTime = 0, this._smoothScrollState.origin = -1, this._smoothScrollState.target = -1;
            }
            _bubbleScroll(e3, t3) {
              const i10 = this._viewportElement.scrollTop + this._lastRecordedViewportHeight;
              return !(t3 < 0 && 0 !== this._viewportElement.scrollTop || t3 > 0 && i10 < this._lastRecordedBufferHeight) || (e3.cancelable && e3.preventDefault(), false);
            }
            handleWheel(e3) {
              const t3 = this._getPixelsScrolled(e3);
              return 0 !== t3 && (this._optionsService.rawOptions.smoothScrollDuration ? (this._smoothScrollState.startTime = Date.now(), this._smoothScrollPercent() < 1 ? (this._smoothScrollState.origin = this._viewportElement.scrollTop, -1 === this._smoothScrollState.target ? this._smoothScrollState.target = this._viewportElement.scrollTop + t3 : this._smoothScrollState.target += t3, this._smoothScrollState.target = Math.max(Math.min(this._smoothScrollState.target, this._viewportElement.scrollHeight), 0), this._smoothScroll()) : this._clearSmoothScrollState()) : this._viewportElement.scrollTop += t3, this._bubbleScroll(e3, t3));
            }
            scrollLines(e3) {
              if (0 !== e3) if (this._optionsService.rawOptions.smoothScrollDuration) {
                const t3 = e3 * this._currentRowHeight;
                this._smoothScrollState.startTime = Date.now(), this._smoothScrollPercent() < 1 ? (this._smoothScrollState.origin = this._viewportElement.scrollTop, this._smoothScrollState.target = this._smoothScrollState.origin + t3, this._smoothScrollState.target = Math.max(Math.min(this._smoothScrollState.target, this._viewportElement.scrollHeight), 0), this._smoothScroll()) : this._clearSmoothScrollState();
              } else this._onRequestScrollLines.fire({ amount: e3, suppressScrollEvent: false });
            }
            _getPixelsScrolled(e3) {
              if (0 === e3.deltaY || e3.shiftKey) return 0;
              let t3 = this._applyScrollModifier(e3.deltaY, e3);
              return e3.deltaMode === WheelEvent.DOM_DELTA_LINE ? t3 *= this._currentRowHeight : e3.deltaMode === WheelEvent.DOM_DELTA_PAGE && (t3 *= this._currentRowHeight * this._bufferService.rows), t3;
            }
            getBufferElements(e3, t3) {
              var i10;
              let s3, r12 = "";
              const n2 = [], o3 = null != t3 ? t3 : this._bufferService.buffer.lines.length, a2 = this._bufferService.buffer.lines;
              for (let t4 = e3; t4 < o3; t4++) {
                const e4 = a2.get(t4);
                if (!e4) continue;
                const o4 = null === (i10 = a2.get(t4 + 1)) || void 0 === i10 ? void 0 : i10.isWrapped;
                if (r12 += e4.translateToString(!o4), !o4 || t4 === a2.length - 1) {
                  const e5 = document.createElement("div");
                  e5.textContent = r12, n2.push(e5), r12.length > 0 && (s3 = e5), r12 = "";
                }
              }
              return { bufferElements: n2, cursorElement: s3 };
            }
            getLinesScrolled(e3) {
              if (0 === e3.deltaY || e3.shiftKey) return 0;
              let t3 = this._applyScrollModifier(e3.deltaY, e3);
              return e3.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? (t3 /= this._currentRowHeight + 0, this._wheelPartialScroll += t3, t3 = Math.floor(Math.abs(this._wheelPartialScroll)) * (this._wheelPartialScroll > 0 ? 1 : -1), this._wheelPartialScroll %= 1) : e3.deltaMode === WheelEvent.DOM_DELTA_PAGE && (t3 *= this._bufferService.rows), t3;
            }
            _applyScrollModifier(e3, t3) {
              const i10 = this._optionsService.rawOptions.fastScrollModifier;
              return "alt" === i10 && t3.altKey || "ctrl" === i10 && t3.ctrlKey || "shift" === i10 && t3.shiftKey ? e3 * this._optionsService.rawOptions.fastScrollSensitivity * this._optionsService.rawOptions.scrollSensitivity : e3 * this._optionsService.rawOptions.scrollSensitivity;
            }
            handleTouchStart(e3) {
              this._lastTouchY = e3.touches[0].pageY;
            }
            handleTouchMove(e3) {
              const t3 = this._lastTouchY - e3.touches[0].pageY;
              return this._lastTouchY = e3.touches[0].pageY, 0 !== t3 && (this._viewportElement.scrollTop += t3, this._bubbleScroll(e3, t3));
            }
          };
          t2.Viewport = l2 = s2([r11(2, c.IBufferService), r11(3, c.IOptionsService), r11(4, o2.ICharSizeService), r11(5, o2.IRenderService), r11(6, o2.ICoreBrowserService), r11(7, o2.IThemeService)], l2);
        }, 3107: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.BufferDecorationRenderer = void 0;
          const n = i9(3656), o2 = i9(4725), a = i9(844), h2 = i9(2585);
          let c = t2.BufferDecorationRenderer = class extends a.Disposable {
            constructor(e3, t3, i10, s3) {
              super(), this._screenElement = e3, this._bufferService = t3, this._decorationService = i10, this._renderService = s3, this._decorationElements = /* @__PURE__ */ new Map(), this._altBufferIsActive = false, this._dimensionsChanged = false, this._container = document.createElement("div"), this._container.classList.add("xterm-decoration-container"), this._screenElement.appendChild(this._container), this.register(this._renderService.onRenderedViewportChange((() => this._doRefreshDecorations()))), this.register(this._renderService.onDimensionsChange((() => {
                this._dimensionsChanged = true, this._queueRefresh();
              }))), this.register((0, n.addDisposableDomListener)(window, "resize", (() => this._queueRefresh()))), this.register(this._bufferService.buffers.onBufferActivate((() => {
                this._altBufferIsActive = this._bufferService.buffer === this._bufferService.buffers.alt;
              }))), this.register(this._decorationService.onDecorationRegistered((() => this._queueRefresh()))), this.register(this._decorationService.onDecorationRemoved(((e4) => this._removeDecoration(e4)))), this.register((0, a.toDisposable)((() => {
                this._container.remove(), this._decorationElements.clear();
              })));
            }
            _queueRefresh() {
              void 0 === this._animationFrame && (this._animationFrame = this._renderService.addRefreshCallback((() => {
                this._doRefreshDecorations(), this._animationFrame = void 0;
              })));
            }
            _doRefreshDecorations() {
              for (const e3 of this._decorationService.decorations) this._renderDecoration(e3);
              this._dimensionsChanged = false;
            }
            _renderDecoration(e3) {
              this._refreshStyle(e3), this._dimensionsChanged && this._refreshXPosition(e3);
            }
            _createElement(e3) {
              var t3, i10;
              const s3 = document.createElement("div");
              s3.classList.add("xterm-decoration"), s3.classList.toggle("xterm-decoration-top-layer", "top" === (null === (t3 = null == e3 ? void 0 : e3.options) || void 0 === t3 ? void 0 : t3.layer)), s3.style.width = `${Math.round((e3.options.width || 1) * this._renderService.dimensions.css.cell.width)}px`, s3.style.height = (e3.options.height || 1) * this._renderService.dimensions.css.cell.height + "px", s3.style.top = (e3.marker.line - this._bufferService.buffers.active.ydisp) * this._renderService.dimensions.css.cell.height + "px", s3.style.lineHeight = `${this._renderService.dimensions.css.cell.height}px`;
              const r12 = null !== (i10 = e3.options.x) && void 0 !== i10 ? i10 : 0;
              return r12 && r12 > this._bufferService.cols && (s3.style.display = "none"), this._refreshXPosition(e3, s3), s3;
            }
            _refreshStyle(e3) {
              const t3 = e3.marker.line - this._bufferService.buffers.active.ydisp;
              if (t3 < 0 || t3 >= this._bufferService.rows) e3.element && (e3.element.style.display = "none", e3.onRenderEmitter.fire(e3.element));
              else {
                let i10 = this._decorationElements.get(e3);
                i10 || (i10 = this._createElement(e3), e3.element = i10, this._decorationElements.set(e3, i10), this._container.appendChild(i10), e3.onDispose((() => {
                  this._decorationElements.delete(e3), i10.remove();
                }))), i10.style.top = t3 * this._renderService.dimensions.css.cell.height + "px", i10.style.display = this._altBufferIsActive ? "none" : "block", e3.onRenderEmitter.fire(i10);
              }
            }
            _refreshXPosition(e3, t3 = e3.element) {
              var i10;
              if (!t3) return;
              const s3 = null !== (i10 = e3.options.x) && void 0 !== i10 ? i10 : 0;
              "right" === (e3.options.anchor || "left") ? t3.style.right = s3 ? s3 * this._renderService.dimensions.css.cell.width + "px" : "" : t3.style.left = s3 ? s3 * this._renderService.dimensions.css.cell.width + "px" : "";
            }
            _removeDecoration(e3) {
              var t3;
              null === (t3 = this._decorationElements.get(e3)) || void 0 === t3 || t3.remove(), this._decorationElements.delete(e3), e3.dispose();
            }
          };
          t2.BufferDecorationRenderer = c = s2([r11(1, h2.IBufferService), r11(2, h2.IDecorationService), r11(3, o2.IRenderService)], c);
        }, 5871: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.ColorZoneStore = void 0, t2.ColorZoneStore = class {
            constructor() {
              this._zones = [], this._zonePool = [], this._zonePoolIndex = 0, this._linePadding = { full: 0, left: 0, center: 0, right: 0 };
            }
            get zones() {
              return this._zonePool.length = Math.min(this._zonePool.length, this._zones.length), this._zones;
            }
            clear() {
              this._zones.length = 0, this._zonePoolIndex = 0;
            }
            addDecoration(e3) {
              if (e3.options.overviewRulerOptions) {
                for (const t3 of this._zones) if (t3.color === e3.options.overviewRulerOptions.color && t3.position === e3.options.overviewRulerOptions.position) {
                  if (this._lineIntersectsZone(t3, e3.marker.line)) return;
                  if (this._lineAdjacentToZone(t3, e3.marker.line, e3.options.overviewRulerOptions.position)) return void this._addLineToZone(t3, e3.marker.line);
                }
                if (this._zonePoolIndex < this._zonePool.length) return this._zonePool[this._zonePoolIndex].color = e3.options.overviewRulerOptions.color, this._zonePool[this._zonePoolIndex].position = e3.options.overviewRulerOptions.position, this._zonePool[this._zonePoolIndex].startBufferLine = e3.marker.line, this._zonePool[this._zonePoolIndex].endBufferLine = e3.marker.line, void this._zones.push(this._zonePool[this._zonePoolIndex++]);
                this._zones.push({ color: e3.options.overviewRulerOptions.color, position: e3.options.overviewRulerOptions.position, startBufferLine: e3.marker.line, endBufferLine: e3.marker.line }), this._zonePool.push(this._zones[this._zones.length - 1]), this._zonePoolIndex++;
              }
            }
            setPadding(e3) {
              this._linePadding = e3;
            }
            _lineIntersectsZone(e3, t3) {
              return t3 >= e3.startBufferLine && t3 <= e3.endBufferLine;
            }
            _lineAdjacentToZone(e3, t3, i9) {
              return t3 >= e3.startBufferLine - this._linePadding[i9 || "full"] && t3 <= e3.endBufferLine + this._linePadding[i9 || "full"];
            }
            _addLineToZone(e3, t3) {
              e3.startBufferLine = Math.min(e3.startBufferLine, t3), e3.endBufferLine = Math.max(e3.endBufferLine, t3);
            }
          };
        }, 5744: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.OverviewRulerRenderer = void 0;
          const n = i9(5871), o2 = i9(3656), a = i9(4725), h2 = i9(844), c = i9(2585), l2 = { full: 0, left: 0, center: 0, right: 0 }, d = { full: 0, left: 0, center: 0, right: 0 }, _4 = { full: 0, left: 0, center: 0, right: 0 };
          let u = t2.OverviewRulerRenderer = class extends h2.Disposable {
            get _width() {
              return this._optionsService.options.overviewRulerWidth || 0;
            }
            constructor(e3, t3, i10, s3, r12, o3, a2) {
              var c2;
              super(), this._viewportElement = e3, this._screenElement = t3, this._bufferService = i10, this._decorationService = s3, this._renderService = r12, this._optionsService = o3, this._coreBrowseService = a2, this._colorZoneStore = new n.ColorZoneStore(), this._shouldUpdateDimensions = true, this._shouldUpdateAnchor = true, this._lastKnownBufferLength = 0, this._canvas = document.createElement("canvas"), this._canvas.classList.add("xterm-decoration-overview-ruler"), this._refreshCanvasDimensions(), null === (c2 = this._viewportElement.parentElement) || void 0 === c2 || c2.insertBefore(this._canvas, this._viewportElement);
              const l3 = this._canvas.getContext("2d");
              if (!l3) throw new Error("Ctx cannot be null");
              this._ctx = l3, this._registerDecorationListeners(), this._registerBufferChangeListeners(), this._registerDimensionChangeListeners(), this.register((0, h2.toDisposable)((() => {
                var e4;
                null === (e4 = this._canvas) || void 0 === e4 || e4.remove();
              })));
            }
            _registerDecorationListeners() {
              this.register(this._decorationService.onDecorationRegistered((() => this._queueRefresh(void 0, true)))), this.register(this._decorationService.onDecorationRemoved((() => this._queueRefresh(void 0, true))));
            }
            _registerBufferChangeListeners() {
              this.register(this._renderService.onRenderedViewportChange((() => this._queueRefresh()))), this.register(this._bufferService.buffers.onBufferActivate((() => {
                this._canvas.style.display = this._bufferService.buffer === this._bufferService.buffers.alt ? "none" : "block";
              }))), this.register(this._bufferService.onScroll((() => {
                this._lastKnownBufferLength !== this._bufferService.buffers.normal.lines.length && (this._refreshDrawHeightConstants(), this._refreshColorZonePadding());
              })));
            }
            _registerDimensionChangeListeners() {
              this.register(this._renderService.onRender((() => {
                this._containerHeight && this._containerHeight === this._screenElement.clientHeight || (this._queueRefresh(true), this._containerHeight = this._screenElement.clientHeight);
              }))), this.register(this._optionsService.onSpecificOptionChange("overviewRulerWidth", (() => this._queueRefresh(true)))), this.register((0, o2.addDisposableDomListener)(this._coreBrowseService.window, "resize", (() => this._queueRefresh(true)))), this._queueRefresh(true);
            }
            _refreshDrawConstants() {
              const e3 = Math.floor(this._canvas.width / 3), t3 = Math.ceil(this._canvas.width / 3);
              d.full = this._canvas.width, d.left = e3, d.center = t3, d.right = e3, this._refreshDrawHeightConstants(), _4.full = 0, _4.left = 0, _4.center = d.left, _4.right = d.left + d.center;
            }
            _refreshDrawHeightConstants() {
              l2.full = Math.round(2 * this._coreBrowseService.dpr);
              const e3 = this._canvas.height / this._bufferService.buffer.lines.length, t3 = Math.round(Math.max(Math.min(e3, 12), 6) * this._coreBrowseService.dpr);
              l2.left = t3, l2.center = t3, l2.right = t3;
            }
            _refreshColorZonePadding() {
              this._colorZoneStore.setPadding({ full: Math.floor(this._bufferService.buffers.active.lines.length / (this._canvas.height - 1) * l2.full), left: Math.floor(this._bufferService.buffers.active.lines.length / (this._canvas.height - 1) * l2.left), center: Math.floor(this._bufferService.buffers.active.lines.length / (this._canvas.height - 1) * l2.center), right: Math.floor(this._bufferService.buffers.active.lines.length / (this._canvas.height - 1) * l2.right) }), this._lastKnownBufferLength = this._bufferService.buffers.normal.lines.length;
            }
            _refreshCanvasDimensions() {
              this._canvas.style.width = `${this._width}px`, this._canvas.width = Math.round(this._width * this._coreBrowseService.dpr), this._canvas.style.height = `${this._screenElement.clientHeight}px`, this._canvas.height = Math.round(this._screenElement.clientHeight * this._coreBrowseService.dpr), this._refreshDrawConstants(), this._refreshColorZonePadding();
            }
            _refreshDecorations() {
              this._shouldUpdateDimensions && this._refreshCanvasDimensions(), this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height), this._colorZoneStore.clear();
              for (const e4 of this._decorationService.decorations) this._colorZoneStore.addDecoration(e4);
              this._ctx.lineWidth = 1;
              const e3 = this._colorZoneStore.zones;
              for (const t3 of e3) "full" !== t3.position && this._renderColorZone(t3);
              for (const t3 of e3) "full" === t3.position && this._renderColorZone(t3);
              this._shouldUpdateDimensions = false, this._shouldUpdateAnchor = false;
            }
            _renderColorZone(e3) {
              this._ctx.fillStyle = e3.color, this._ctx.fillRect(_4[e3.position || "full"], Math.round((this._canvas.height - 1) * (e3.startBufferLine / this._bufferService.buffers.active.lines.length) - l2[e3.position || "full"] / 2), d[e3.position || "full"], Math.round((this._canvas.height - 1) * ((e3.endBufferLine - e3.startBufferLine) / this._bufferService.buffers.active.lines.length) + l2[e3.position || "full"]));
            }
            _queueRefresh(e3, t3) {
              this._shouldUpdateDimensions = e3 || this._shouldUpdateDimensions, this._shouldUpdateAnchor = t3 || this._shouldUpdateAnchor, void 0 === this._animationFrame && (this._animationFrame = this._coreBrowseService.window.requestAnimationFrame((() => {
                this._refreshDecorations(), this._animationFrame = void 0;
              })));
            }
          };
          t2.OverviewRulerRenderer = u = s2([r11(2, c.IBufferService), r11(3, c.IDecorationService), r11(4, a.IRenderService), r11(5, c.IOptionsService), r11(6, a.ICoreBrowserService)], u);
        }, 2950: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.CompositionHelper = void 0;
          const n = i9(4725), o2 = i9(2585), a = i9(2584);
          let h2 = t2.CompositionHelper = class {
            get isComposing() {
              return this._isComposing;
            }
            constructor(e3, t3, i10, s3, r12, n2) {
              this._textarea = e3, this._compositionView = t3, this._bufferService = i10, this._optionsService = s3, this._coreService = r12, this._renderService = n2, this._isComposing = false, this._isSendingComposition = false, this._compositionPosition = { start: 0, end: 0 }, this._dataAlreadySent = "";
            }
            compositionstart() {
              this._isComposing = true, this._compositionPosition.start = this._textarea.value.length, this._compositionView.textContent = "", this._dataAlreadySent = "", this._compositionView.classList.add("active");
            }
            compositionupdate(e3) {
              this._compositionView.textContent = e3.data, this.updateCompositionElements(), setTimeout((() => {
                this._compositionPosition.end = this._textarea.value.length;
              }), 0);
            }
            compositionend() {
              this._finalizeComposition(true);
            }
            keydown(e3) {
              if (this._isComposing || this._isSendingComposition) {
                if (229 === e3.keyCode) return false;
                if (16 === e3.keyCode || 17 === e3.keyCode || 18 === e3.keyCode) return false;
                this._finalizeComposition(false);
              }
              return 229 !== e3.keyCode || (this._handleAnyTextareaChanges(), false);
            }
            _finalizeComposition(e3) {
              if (this._compositionView.classList.remove("active"), this._isComposing = false, e3) {
                const e4 = { start: this._compositionPosition.start, end: this._compositionPosition.end };
                this._isSendingComposition = true, setTimeout((() => {
                  if (this._isSendingComposition) {
                    let t3;
                    this._isSendingComposition = false, e4.start += this._dataAlreadySent.length, t3 = this._isComposing ? this._textarea.value.substring(e4.start, e4.end) : this._textarea.value.substring(e4.start), t3.length > 0 && this._coreService.triggerDataEvent(t3, true);
                  }
                }), 0);
              } else {
                this._isSendingComposition = false;
                const e4 = this._textarea.value.substring(this._compositionPosition.start, this._compositionPosition.end);
                this._coreService.triggerDataEvent(e4, true);
              }
            }
            _handleAnyTextareaChanges() {
              const e3 = this._textarea.value;
              setTimeout((() => {
                if (!this._isComposing) {
                  const t3 = this._textarea.value, i10 = t3.replace(e3, "");
                  this._dataAlreadySent = i10, t3.length > e3.length ? this._coreService.triggerDataEvent(i10, true) : t3.length < e3.length ? this._coreService.triggerDataEvent(`${a.C0.DEL}`, true) : t3.length === e3.length && t3 !== e3 && this._coreService.triggerDataEvent(t3, true);
                }
              }), 0);
            }
            updateCompositionElements(e3) {
              if (this._isComposing) {
                if (this._bufferService.buffer.isCursorInViewport) {
                  const e4 = Math.min(this._bufferService.buffer.x, this._bufferService.cols - 1), t3 = this._renderService.dimensions.css.cell.height, i10 = this._bufferService.buffer.y * this._renderService.dimensions.css.cell.height, s3 = e4 * this._renderService.dimensions.css.cell.width;
                  this._compositionView.style.left = s3 + "px", this._compositionView.style.top = i10 + "px", this._compositionView.style.height = t3 + "px", this._compositionView.style.lineHeight = t3 + "px", this._compositionView.style.fontFamily = this._optionsService.rawOptions.fontFamily, this._compositionView.style.fontSize = this._optionsService.rawOptions.fontSize + "px";
                  const r12 = this._compositionView.getBoundingClientRect();
                  this._textarea.style.left = s3 + "px", this._textarea.style.top = i10 + "px", this._textarea.style.width = Math.max(r12.width, 1) + "px", this._textarea.style.height = Math.max(r12.height, 1) + "px", this._textarea.style.lineHeight = r12.height + "px";
                }
                e3 || setTimeout((() => this.updateCompositionElements(true)), 0);
              }
            }
          };
          t2.CompositionHelper = h2 = s2([r11(2, o2.IBufferService), r11(3, o2.IOptionsService), r11(4, o2.ICoreService), r11(5, n.IRenderService)], h2);
        }, 9806: (e2, t2) => {
          function i9(e3, t3, i10) {
            const s2 = i10.getBoundingClientRect(), r11 = e3.getComputedStyle(i10), n = parseInt(r11.getPropertyValue("padding-left")), o2 = parseInt(r11.getPropertyValue("padding-top"));
            return [t3.clientX - s2.left - n, t3.clientY - s2.top - o2];
          }
          Object.defineProperty(t2, "__esModule", { value: true }), t2.getCoords = t2.getCoordsRelativeToElement = void 0, t2.getCoordsRelativeToElement = i9, t2.getCoords = function(e3, t3, s2, r11, n, o2, a, h2, c) {
            if (!o2) return;
            const l2 = i9(e3, t3, s2);
            return l2 ? (l2[0] = Math.ceil((l2[0] + (c ? a / 2 : 0)) / a), l2[1] = Math.ceil(l2[1] / h2), l2[0] = Math.min(Math.max(l2[0], 1), r11 + (c ? 1 : 0)), l2[1] = Math.min(Math.max(l2[1], 1), n), l2) : void 0;
          };
        }, 9504: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.moveToCellSequence = void 0;
          const s2 = i9(2584);
          function r11(e3, t3, i10, s3) {
            const r12 = e3 - n(e3, i10), a2 = t3 - n(t3, i10), l2 = Math.abs(r12 - a2) - (function(e4, t4, i11) {
              let s4 = 0;
              const r13 = e4 - n(e4, i11), a3 = t4 - n(t4, i11);
              for (let n2 = 0; n2 < Math.abs(r13 - a3); n2++) {
                const a4 = "A" === o2(e4, t4) ? -1 : 1, h3 = i11.buffer.lines.get(r13 + a4 * n2);
                (null == h3 ? void 0 : h3.isWrapped) && s4++;
              }
              return s4;
            })(e3, t3, i10);
            return c(l2, h2(o2(e3, t3), s3));
          }
          function n(e3, t3) {
            let i10 = 0, s3 = t3.buffer.lines.get(e3), r12 = null == s3 ? void 0 : s3.isWrapped;
            for (; r12 && e3 >= 0 && e3 < t3.rows; ) i10++, s3 = t3.buffer.lines.get(--e3), r12 = null == s3 ? void 0 : s3.isWrapped;
            return i10;
          }
          function o2(e3, t3) {
            return e3 > t3 ? "A" : "B";
          }
          function a(e3, t3, i10, s3, r12, n2) {
            let o3 = e3, a2 = t3, h3 = "";
            for (; o3 !== i10 || a2 !== s3; ) o3 += r12 ? 1 : -1, r12 && o3 > n2.cols - 1 ? (h3 += n2.buffer.translateBufferLineToString(a2, false, e3, o3), o3 = 0, e3 = 0, a2++) : !r12 && o3 < 0 && (h3 += n2.buffer.translateBufferLineToString(a2, false, 0, e3 + 1), o3 = n2.cols - 1, e3 = o3, a2--);
            return h3 + n2.buffer.translateBufferLineToString(a2, false, e3, o3);
          }
          function h2(e3, t3) {
            const i10 = t3 ? "O" : "[";
            return s2.C0.ESC + i10 + e3;
          }
          function c(e3, t3) {
            e3 = Math.floor(e3);
            let i10 = "";
            for (let s3 = 0; s3 < e3; s3++) i10 += t3;
            return i10;
          }
          t2.moveToCellSequence = function(e3, t3, i10, s3) {
            const o3 = i10.buffer.x, l2 = i10.buffer.y;
            if (!i10.buffer.hasScrollback) return (function(e4, t4, i11, s4, o4, l3) {
              return 0 === r11(t4, s4, o4, l3).length ? "" : c(a(e4, t4, e4, t4 - n(t4, o4), false, o4).length, h2("D", l3));
            })(o3, l2, 0, t3, i10, s3) + r11(l2, t3, i10, s3) + (function(e4, t4, i11, s4, o4, l3) {
              let d2;
              d2 = r11(t4, s4, o4, l3).length > 0 ? s4 - n(s4, o4) : t4;
              const _5 = s4, u = (function(e5, t5, i12, s5, o5, a2) {
                let h3;
                return h3 = r11(i12, s5, o5, a2).length > 0 ? s5 - n(s5, o5) : t5, e5 < i12 && h3 <= s5 || e5 >= i12 && h3 < s5 ? "C" : "D";
              })(e4, t4, i11, s4, o4, l3);
              return c(a(e4, d2, i11, _5, "C" === u, o4).length, h2(u, l3));
            })(o3, l2, e3, t3, i10, s3);
            let d;
            if (l2 === t3) return d = o3 > e3 ? "D" : "C", c(Math.abs(o3 - e3), h2(d, s3));
            d = l2 > t3 ? "D" : "C";
            const _4 = Math.abs(l2 - t3);
            return c((function(e4, t4) {
              return t4.cols - e4;
            })(l2 > t3 ? e3 : o3, i10) + (_4 - 1) * i10.cols + 1 + ((l2 > t3 ? o3 : e3) - 1), h2(d, s3));
          };
        }, 1296: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.DomRenderer = void 0;
          const n = i9(3787), o2 = i9(2550), a = i9(2223), h2 = i9(6171), c = i9(4725), l2 = i9(8055), d = i9(8460), _4 = i9(844), u = i9(2585), f = "xterm-dom-renderer-owner-", v3 = "xterm-rows", p = "xterm-fg-", g2 = "xterm-bg-", m = "xterm-focus", S2 = "xterm-selection";
          let C4 = 1, b = t2.DomRenderer = class extends _4.Disposable {
            constructor(e3, t3, i10, s3, r12, a2, c2, l3, u2, p2) {
              super(), this._element = e3, this._screenElement = t3, this._viewportElement = i10, this._linkifier2 = s3, this._charSizeService = a2, this._optionsService = c2, this._bufferService = l3, this._coreBrowserService = u2, this._themeService = p2, this._terminalClass = C4++, this._rowElements = [], this.onRequestRedraw = this.register(new d.EventEmitter()).event, this._rowContainer = document.createElement("div"), this._rowContainer.classList.add(v3), this._rowContainer.style.lineHeight = "normal", this._rowContainer.setAttribute("aria-hidden", "true"), this._refreshRowElements(this._bufferService.cols, this._bufferService.rows), this._selectionContainer = document.createElement("div"), this._selectionContainer.classList.add(S2), this._selectionContainer.setAttribute("aria-hidden", "true"), this.dimensions = (0, h2.createRenderDimensions)(), this._updateDimensions(), this.register(this._optionsService.onOptionChange((() => this._handleOptionsChanged()))), this.register(this._themeService.onChangeColors(((e4) => this._injectCss(e4)))), this._injectCss(this._themeService.colors), this._rowFactory = r12.createInstance(n.DomRendererRowFactory, document), this._element.classList.add(f + this._terminalClass), this._screenElement.appendChild(this._rowContainer), this._screenElement.appendChild(this._selectionContainer), this.register(this._linkifier2.onShowLinkUnderline(((e4) => this._handleLinkHover(e4)))), this.register(this._linkifier2.onHideLinkUnderline(((e4) => this._handleLinkLeave(e4)))), this.register((0, _4.toDisposable)((() => {
                this._element.classList.remove(f + this._terminalClass), this._rowContainer.remove(), this._selectionContainer.remove(), this._widthCache.dispose(), this._themeStyleElement.remove(), this._dimensionsStyleElement.remove();
              }))), this._widthCache = new o2.WidthCache(document), this._widthCache.setFont(this._optionsService.rawOptions.fontFamily, this._optionsService.rawOptions.fontSize, this._optionsService.rawOptions.fontWeight, this._optionsService.rawOptions.fontWeightBold), this._setDefaultSpacing();
            }
            _updateDimensions() {
              const e3 = this._coreBrowserService.dpr;
              this.dimensions.device.char.width = this._charSizeService.width * e3, this.dimensions.device.char.height = Math.ceil(this._charSizeService.height * e3), this.dimensions.device.cell.width = this.dimensions.device.char.width + Math.round(this._optionsService.rawOptions.letterSpacing), this.dimensions.device.cell.height = Math.floor(this.dimensions.device.char.height * this._optionsService.rawOptions.lineHeight), this.dimensions.device.char.left = 0, this.dimensions.device.char.top = 0, this.dimensions.device.canvas.width = this.dimensions.device.cell.width * this._bufferService.cols, this.dimensions.device.canvas.height = this.dimensions.device.cell.height * this._bufferService.rows, this.dimensions.css.canvas.width = Math.round(this.dimensions.device.canvas.width / e3), this.dimensions.css.canvas.height = Math.round(this.dimensions.device.canvas.height / e3), this.dimensions.css.cell.width = this.dimensions.css.canvas.width / this._bufferService.cols, this.dimensions.css.cell.height = this.dimensions.css.canvas.height / this._bufferService.rows;
              for (const e4 of this._rowElements) e4.style.width = `${this.dimensions.css.canvas.width}px`, e4.style.height = `${this.dimensions.css.cell.height}px`, e4.style.lineHeight = `${this.dimensions.css.cell.height}px`, e4.style.overflow = "hidden";
              this._dimensionsStyleElement || (this._dimensionsStyleElement = document.createElement("style"), this._screenElement.appendChild(this._dimensionsStyleElement));
              const t3 = `${this._terminalSelector} .${v3} span { display: inline-block; height: 100%; vertical-align: top;}`;
              this._dimensionsStyleElement.textContent = t3, this._selectionContainer.style.height = this._viewportElement.style.height, this._screenElement.style.width = `${this.dimensions.css.canvas.width}px`, this._screenElement.style.height = `${this.dimensions.css.canvas.height}px`;
            }
            _injectCss(e3) {
              this._themeStyleElement || (this._themeStyleElement = document.createElement("style"), this._screenElement.appendChild(this._themeStyleElement));
              let t3 = `${this._terminalSelector} .${v3} { color: ${e3.foreground.css}; font-family: ${this._optionsService.rawOptions.fontFamily}; font-size: ${this._optionsService.rawOptions.fontSize}px; font-kerning: none; white-space: pre}`;
              t3 += `${this._terminalSelector} .${v3} .xterm-dim { color: ${l2.color.multiplyOpacity(e3.foreground, 0.5).css};}`, t3 += `${this._terminalSelector} span:not(.xterm-bold) { font-weight: ${this._optionsService.rawOptions.fontWeight};}${this._terminalSelector} span.xterm-bold { font-weight: ${this._optionsService.rawOptions.fontWeightBold};}${this._terminalSelector} span.xterm-italic { font-style: italic;}`, t3 += "@keyframes blink_box_shadow_" + this._terminalClass + " { 50% {  border-bottom-style: hidden; }}", t3 += "@keyframes blink_block_" + this._terminalClass + ` { 0% {  background-color: ${e3.cursor.css};  color: ${e3.cursorAccent.css}; } 50% {  background-color: inherit;  color: ${e3.cursor.css}; }}`, t3 += `${this._terminalSelector} .${v3}.${m} .xterm-cursor.xterm-cursor-blink:not(.xterm-cursor-block) { animation: blink_box_shadow_` + this._terminalClass + ` 1s step-end infinite;}${this._terminalSelector} .${v3}.${m} .xterm-cursor.xterm-cursor-blink.xterm-cursor-block { animation: blink_block_` + this._terminalClass + ` 1s step-end infinite;}${this._terminalSelector} .${v3} .xterm-cursor.xterm-cursor-block { background-color: ${e3.cursor.css}; color: ${e3.cursorAccent.css};}${this._terminalSelector} .${v3} .xterm-cursor.xterm-cursor-outline { outline: 1px solid ${e3.cursor.css}; outline-offset: -1px;}${this._terminalSelector} .${v3} .xterm-cursor.xterm-cursor-bar { box-shadow: ${this._optionsService.rawOptions.cursorWidth}px 0 0 ${e3.cursor.css} inset;}${this._terminalSelector} .${v3} .xterm-cursor.xterm-cursor-underline { border-bottom: 1px ${e3.cursor.css}; border-bottom-style: solid; height: calc(100% - 1px);}`, t3 += `${this._terminalSelector} .${S2} { position: absolute; top: 0; left: 0; z-index: 1; pointer-events: none;}${this._terminalSelector}.focus .${S2} div { position: absolute; background-color: ${e3.selectionBackgroundOpaque.css};}${this._terminalSelector} .${S2} div { position: absolute; background-color: ${e3.selectionInactiveBackgroundOpaque.css};}`;
              for (const [i10, s3] of e3.ansi.entries()) t3 += `${this._terminalSelector} .${p}${i10} { color: ${s3.css}; }${this._terminalSelector} .${p}${i10}.xterm-dim { color: ${l2.color.multiplyOpacity(s3, 0.5).css}; }${this._terminalSelector} .${g2}${i10} { background-color: ${s3.css}; }`;
              t3 += `${this._terminalSelector} .${p}${a.INVERTED_DEFAULT_COLOR} { color: ${l2.color.opaque(e3.background).css}; }${this._terminalSelector} .${p}${a.INVERTED_DEFAULT_COLOR}.xterm-dim { color: ${l2.color.multiplyOpacity(l2.color.opaque(e3.background), 0.5).css}; }${this._terminalSelector} .${g2}${a.INVERTED_DEFAULT_COLOR} { background-color: ${e3.foreground.css}; }`, this._themeStyleElement.textContent = t3;
            }
            _setDefaultSpacing() {
              const e3 = this.dimensions.css.cell.width - this._widthCache.get("W", false, false);
              this._rowContainer.style.letterSpacing = `${e3}px`, this._rowFactory.defaultSpacing = e3;
            }
            handleDevicePixelRatioChange() {
              this._updateDimensions(), this._widthCache.clear(), this._setDefaultSpacing();
            }
            _refreshRowElements(e3, t3) {
              for (let e4 = this._rowElements.length; e4 <= t3; e4++) {
                const e5 = document.createElement("div");
                this._rowContainer.appendChild(e5), this._rowElements.push(e5);
              }
              for (; this._rowElements.length > t3; ) this._rowContainer.removeChild(this._rowElements.pop());
            }
            handleResize(e3, t3) {
              this._refreshRowElements(e3, t3), this._updateDimensions();
            }
            handleCharSizeChanged() {
              this._updateDimensions(), this._widthCache.clear(), this._setDefaultSpacing();
            }
            handleBlur() {
              this._rowContainer.classList.remove(m);
            }
            handleFocus() {
              this._rowContainer.classList.add(m), this.renderRows(this._bufferService.buffer.y, this._bufferService.buffer.y);
            }
            handleSelectionChanged(e3, t3, i10) {
              if (this._selectionContainer.replaceChildren(), this._rowFactory.handleSelectionChanged(e3, t3, i10), this.renderRows(0, this._bufferService.rows - 1), !e3 || !t3) return;
              const s3 = e3[1] - this._bufferService.buffer.ydisp, r12 = t3[1] - this._bufferService.buffer.ydisp, n2 = Math.max(s3, 0), o3 = Math.min(r12, this._bufferService.rows - 1);
              if (n2 >= this._bufferService.rows || o3 < 0) return;
              const a2 = document.createDocumentFragment();
              if (i10) {
                const i11 = e3[0] > t3[0];
                a2.appendChild(this._createSelectionElement(n2, i11 ? t3[0] : e3[0], i11 ? e3[0] : t3[0], o3 - n2 + 1));
              } else {
                const i11 = s3 === n2 ? e3[0] : 0, h3 = n2 === r12 ? t3[0] : this._bufferService.cols;
                a2.appendChild(this._createSelectionElement(n2, i11, h3));
                const c2 = o3 - n2 - 1;
                if (a2.appendChild(this._createSelectionElement(n2 + 1, 0, this._bufferService.cols, c2)), n2 !== o3) {
                  const e4 = r12 === o3 ? t3[0] : this._bufferService.cols;
                  a2.appendChild(this._createSelectionElement(o3, 0, e4));
                }
              }
              this._selectionContainer.appendChild(a2);
            }
            _createSelectionElement(e3, t3, i10, s3 = 1) {
              const r12 = document.createElement("div");
              return r12.style.height = s3 * this.dimensions.css.cell.height + "px", r12.style.top = e3 * this.dimensions.css.cell.height + "px", r12.style.left = t3 * this.dimensions.css.cell.width + "px", r12.style.width = this.dimensions.css.cell.width * (i10 - t3) + "px", r12;
            }
            handleCursorMove() {
            }
            _handleOptionsChanged() {
              this._updateDimensions(), this._injectCss(this._themeService.colors), this._widthCache.setFont(this._optionsService.rawOptions.fontFamily, this._optionsService.rawOptions.fontSize, this._optionsService.rawOptions.fontWeight, this._optionsService.rawOptions.fontWeightBold), this._setDefaultSpacing();
            }
            clear() {
              for (const e3 of this._rowElements) e3.replaceChildren();
            }
            renderRows(e3, t3) {
              const i10 = this._bufferService.buffer, s3 = i10.ybase + i10.y, r12 = Math.min(i10.x, this._bufferService.cols - 1), n2 = this._optionsService.rawOptions.cursorBlink, o3 = this._optionsService.rawOptions.cursorStyle, a2 = this._optionsService.rawOptions.cursorInactiveStyle;
              for (let h3 = e3; h3 <= t3; h3++) {
                const e4 = h3 + i10.ydisp, t4 = this._rowElements[h3], c2 = i10.lines.get(e4);
                if (!t4 || !c2) break;
                t4.replaceChildren(...this._rowFactory.createRow(c2, e4, e4 === s3, o3, a2, r12, n2, this.dimensions.css.cell.width, this._widthCache, -1, -1));
              }
            }
            get _terminalSelector() {
              return `.${f}${this._terminalClass}`;
            }
            _handleLinkHover(e3) {
              this._setCellUnderline(e3.x1, e3.x2, e3.y1, e3.y2, e3.cols, true);
            }
            _handleLinkLeave(e3) {
              this._setCellUnderline(e3.x1, e3.x2, e3.y1, e3.y2, e3.cols, false);
            }
            _setCellUnderline(e3, t3, i10, s3, r12, n2) {
              i10 < 0 && (e3 = 0), s3 < 0 && (t3 = 0);
              const o3 = this._bufferService.rows - 1;
              i10 = Math.max(Math.min(i10, o3), 0), s3 = Math.max(Math.min(s3, o3), 0), r12 = Math.min(r12, this._bufferService.cols);
              const a2 = this._bufferService.buffer, h3 = a2.ybase + a2.y, c2 = Math.min(a2.x, r12 - 1), l3 = this._optionsService.rawOptions.cursorBlink, d2 = this._optionsService.rawOptions.cursorStyle, _5 = this._optionsService.rawOptions.cursorInactiveStyle;
              for (let o4 = i10; o4 <= s3; ++o4) {
                const u2 = o4 + a2.ydisp, f2 = this._rowElements[o4], v4 = a2.lines.get(u2);
                if (!f2 || !v4) break;
                f2.replaceChildren(...this._rowFactory.createRow(v4, u2, u2 === h3, d2, _5, c2, l3, this.dimensions.css.cell.width, this._widthCache, n2 ? o4 === i10 ? e3 : 0 : -1, n2 ? (o4 === s3 ? t3 : r12) - 1 : -1));
              }
            }
          };
          t2.DomRenderer = b = s2([r11(4, u.IInstantiationService), r11(5, c.ICharSizeService), r11(6, u.IOptionsService), r11(7, u.IBufferService), r11(8, c.ICoreBrowserService), r11(9, c.IThemeService)], b);
        }, 3787: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.DomRendererRowFactory = void 0;
          const n = i9(2223), o2 = i9(643), a = i9(511), h2 = i9(2585), c = i9(8055), l2 = i9(4725), d = i9(4269), _4 = i9(6171), u = i9(3734);
          let f = t2.DomRendererRowFactory = class {
            constructor(e3, t3, i10, s3, r12, n2, o3) {
              this._document = e3, this._characterJoinerService = t3, this._optionsService = i10, this._coreBrowserService = s3, this._coreService = r12, this._decorationService = n2, this._themeService = o3, this._workCell = new a.CellData(), this._columnSelectMode = false, this.defaultSpacing = 0;
            }
            handleSelectionChanged(e3, t3, i10) {
              this._selectionStart = e3, this._selectionEnd = t3, this._columnSelectMode = i10;
            }
            createRow(e3, t3, i10, s3, r12, a2, h3, l3, _5, f2, p) {
              const g2 = [], m = this._characterJoinerService.getJoinedCharacters(t3), S2 = this._themeService.colors;
              let C4, b = e3.getNoBgTrimmedLength();
              i10 && b < a2 + 1 && (b = a2 + 1);
              let y = 0, w4 = "", E = 0, k4 = 0, L2 = 0, D2 = false, R3 = 0, x = false, A3 = 0;
              const B4 = [], T2 = -1 !== f2 && -1 !== p;
              for (let M6 = 0; M6 < b; M6++) {
                e3.loadCell(M6, this._workCell);
                let b2 = this._workCell.getWidth();
                if (0 === b2) continue;
                let O4 = false, P5 = M6, I2 = this._workCell;
                if (m.length > 0 && M6 === m[0][0]) {
                  O4 = true;
                  const t4 = m.shift();
                  I2 = new d.JoinedCellData(this._workCell, e3.translateToString(true, t4[0], t4[1]), t4[1] - t4[0]), P5 = t4[1] - 1, b2 = I2.getWidth();
                }
                const H5 = this._isCellInSelection(M6, t3), F4 = i10 && M6 === a2, W3 = T2 && M6 >= f2 && M6 <= p;
                let U3 = false;
                this._decorationService.forEachDecorationAtCell(M6, t3, void 0, ((e4) => {
                  U3 = true;
                }));
                let N4 = I2.getChars() || o2.WHITESPACE_CELL_CHAR;
                if (" " === N4 && (I2.isUnderline() || I2.isOverline()) && (N4 = "\xA0"), A3 = b2 * l3 - _5.get(N4, I2.isBold(), I2.isItalic()), C4) {
                  if (y && (H5 && x || !H5 && !x && I2.bg === E) && (H5 && x && S2.selectionForeground || I2.fg === k4) && I2.extended.ext === L2 && W3 === D2 && A3 === R3 && !F4 && !O4 && !U3) {
                    w4 += N4, y++;
                    continue;
                  }
                  y && (C4.textContent = w4), C4 = this._document.createElement("span"), y = 0, w4 = "";
                } else C4 = this._document.createElement("span");
                if (E = I2.bg, k4 = I2.fg, L2 = I2.extended.ext, D2 = W3, R3 = A3, x = H5, O4 && a2 >= M6 && a2 <= P5 && (a2 = M6), !this._coreService.isCursorHidden && F4) {
                  if (B4.push("xterm-cursor"), this._coreBrowserService.isFocused) h3 && B4.push("xterm-cursor-blink"), B4.push("bar" === s3 ? "xterm-cursor-bar" : "underline" === s3 ? "xterm-cursor-underline" : "xterm-cursor-block");
                  else if (r12) switch (r12) {
                    case "outline":
                      B4.push("xterm-cursor-outline");
                      break;
                    case "block":
                      B4.push("xterm-cursor-block");
                      break;
                    case "bar":
                      B4.push("xterm-cursor-bar");
                      break;
                    case "underline":
                      B4.push("xterm-cursor-underline");
                  }
                }
                if (I2.isBold() && B4.push("xterm-bold"), I2.isItalic() && B4.push("xterm-italic"), I2.isDim() && B4.push("xterm-dim"), w4 = I2.isInvisible() ? o2.WHITESPACE_CELL_CHAR : I2.getChars() || o2.WHITESPACE_CELL_CHAR, I2.isUnderline() && (B4.push(`xterm-underline-${I2.extended.underlineStyle}`), " " === w4 && (w4 = "\xA0"), !I2.isUnderlineColorDefault())) if (I2.isUnderlineColorRGB()) C4.style.textDecorationColor = `rgb(${u.AttributeData.toColorRGB(I2.getUnderlineColor()).join(",")})`;
                else {
                  let e4 = I2.getUnderlineColor();
                  this._optionsService.rawOptions.drawBoldTextInBrightColors && I2.isBold() && e4 < 8 && (e4 += 8), C4.style.textDecorationColor = S2.ansi[e4].css;
                }
                I2.isOverline() && (B4.push("xterm-overline"), " " === w4 && (w4 = "\xA0")), I2.isStrikethrough() && B4.push("xterm-strikethrough"), W3 && (C4.style.textDecoration = "underline");
                let $4 = I2.getFgColor(), j4 = I2.getFgColorMode(), z3 = I2.getBgColor(), K4 = I2.getBgColorMode();
                const q3 = !!I2.isInverse();
                if (q3) {
                  const e4 = $4;
                  $4 = z3, z3 = e4;
                  const t4 = j4;
                  j4 = K4, K4 = t4;
                }
                let V5, G4, X6, J4 = false;
                switch (this._decorationService.forEachDecorationAtCell(M6, t3, void 0, ((e4) => {
                  "top" !== e4.options.layer && J4 || (e4.backgroundColorRGB && (K4 = 50331648, z3 = e4.backgroundColorRGB.rgba >> 8 & 16777215, V5 = e4.backgroundColorRGB), e4.foregroundColorRGB && (j4 = 50331648, $4 = e4.foregroundColorRGB.rgba >> 8 & 16777215, G4 = e4.foregroundColorRGB), J4 = "top" === e4.options.layer);
                })), !J4 && H5 && (V5 = this._coreBrowserService.isFocused ? S2.selectionBackgroundOpaque : S2.selectionInactiveBackgroundOpaque, z3 = V5.rgba >> 8 & 16777215, K4 = 50331648, J4 = true, S2.selectionForeground && (j4 = 50331648, $4 = S2.selectionForeground.rgba >> 8 & 16777215, G4 = S2.selectionForeground)), J4 && B4.push("xterm-decoration-top"), K4) {
                  case 16777216:
                  case 33554432:
                    X6 = S2.ansi[z3], B4.push(`xterm-bg-${z3}`);
                    break;
                  case 50331648:
                    X6 = c.rgba.toColor(z3 >> 16, z3 >> 8 & 255, 255 & z3), this._addStyle(C4, `background-color:#${v3((z3 >>> 0).toString(16), "0", 6)}`);
                    break;
                  default:
                    q3 ? (X6 = S2.foreground, B4.push(`xterm-bg-${n.INVERTED_DEFAULT_COLOR}`)) : X6 = S2.background;
                }
                switch (V5 || I2.isDim() && (V5 = c.color.multiplyOpacity(X6, 0.5)), j4) {
                  case 16777216:
                  case 33554432:
                    I2.isBold() && $4 < 8 && this._optionsService.rawOptions.drawBoldTextInBrightColors && ($4 += 8), this._applyMinimumContrast(C4, X6, S2.ansi[$4], I2, V5, void 0) || B4.push(`xterm-fg-${$4}`);
                    break;
                  case 50331648:
                    const e4 = c.rgba.toColor($4 >> 16 & 255, $4 >> 8 & 255, 255 & $4);
                    this._applyMinimumContrast(C4, X6, e4, I2, V5, G4) || this._addStyle(C4, `color:#${v3($4.toString(16), "0", 6)}`);
                    break;
                  default:
                    this._applyMinimumContrast(C4, X6, S2.foreground, I2, V5, void 0) || q3 && B4.push(`xterm-fg-${n.INVERTED_DEFAULT_COLOR}`);
                }
                B4.length && (C4.className = B4.join(" "), B4.length = 0), F4 || O4 || U3 ? C4.textContent = w4 : y++, A3 !== this.defaultSpacing && (C4.style.letterSpacing = `${A3}px`), g2.push(C4), M6 = P5;
              }
              return C4 && y && (C4.textContent = w4), g2;
            }
            _applyMinimumContrast(e3, t3, i10, s3, r12, n2) {
              if (1 === this._optionsService.rawOptions.minimumContrastRatio || (0, _4.excludeFromContrastRatioDemands)(s3.getCode())) return false;
              const o3 = this._getContrastCache(s3);
              let a2;
              if (r12 || n2 || (a2 = o3.getColor(t3.rgba, i10.rgba)), void 0 === a2) {
                const e4 = this._optionsService.rawOptions.minimumContrastRatio / (s3.isDim() ? 2 : 1);
                a2 = c.color.ensureContrastRatio(r12 || t3, n2 || i10, e4), o3.setColor((r12 || t3).rgba, (n2 || i10).rgba, null != a2 ? a2 : null);
              }
              return !!a2 && (this._addStyle(e3, `color:${a2.css}`), true);
            }
            _getContrastCache(e3) {
              return e3.isDim() ? this._themeService.colors.halfContrastCache : this._themeService.colors.contrastCache;
            }
            _addStyle(e3, t3) {
              e3.setAttribute("style", `${e3.getAttribute("style") || ""}${t3};`);
            }
            _isCellInSelection(e3, t3) {
              const i10 = this._selectionStart, s3 = this._selectionEnd;
              return !(!i10 || !s3) && (this._columnSelectMode ? i10[0] <= s3[0] ? e3 >= i10[0] && t3 >= i10[1] && e3 < s3[0] && t3 <= s3[1] : e3 < i10[0] && t3 >= i10[1] && e3 >= s3[0] && t3 <= s3[1] : t3 > i10[1] && t3 < s3[1] || i10[1] === s3[1] && t3 === i10[1] && e3 >= i10[0] && e3 < s3[0] || i10[1] < s3[1] && t3 === s3[1] && e3 < s3[0] || i10[1] < s3[1] && t3 === i10[1] && e3 >= i10[0]);
            }
          };
          function v3(e3, t3, i10) {
            for (; e3.length < i10; ) e3 = t3 + e3;
            return e3;
          }
          t2.DomRendererRowFactory = f = s2([r11(1, l2.ICharacterJoinerService), r11(2, h2.IOptionsService), r11(3, l2.ICoreBrowserService), r11(4, h2.ICoreService), r11(5, h2.IDecorationService), r11(6, l2.IThemeService)], f);
        }, 2550: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.WidthCache = void 0, t2.WidthCache = class {
            constructor(e3) {
              this._flat = new Float32Array(256), this._font = "", this._fontSize = 0, this._weight = "normal", this._weightBold = "bold", this._measureElements = [], this._container = e3.createElement("div"), this._container.style.position = "absolute", this._container.style.top = "-50000px", this._container.style.width = "50000px", this._container.style.whiteSpace = "pre", this._container.style.fontKerning = "none";
              const t3 = e3.createElement("span"), i9 = e3.createElement("span");
              i9.style.fontWeight = "bold";
              const s2 = e3.createElement("span");
              s2.style.fontStyle = "italic";
              const r11 = e3.createElement("span");
              r11.style.fontWeight = "bold", r11.style.fontStyle = "italic", this._measureElements = [t3, i9, s2, r11], this._container.appendChild(t3), this._container.appendChild(i9), this._container.appendChild(s2), this._container.appendChild(r11), e3.body.appendChild(this._container), this.clear();
            }
            dispose() {
              this._container.remove(), this._measureElements.length = 0, this._holey = void 0;
            }
            clear() {
              this._flat.fill(-9999), this._holey = /* @__PURE__ */ new Map();
            }
            setFont(e3, t3, i9, s2) {
              e3 === this._font && t3 === this._fontSize && i9 === this._weight && s2 === this._weightBold || (this._font = e3, this._fontSize = t3, this._weight = i9, this._weightBold = s2, this._container.style.fontFamily = this._font, this._container.style.fontSize = `${this._fontSize}px`, this._measureElements[0].style.fontWeight = `${i9}`, this._measureElements[1].style.fontWeight = `${s2}`, this._measureElements[2].style.fontWeight = `${i9}`, this._measureElements[3].style.fontWeight = `${s2}`, this.clear());
            }
            get(e3, t3, i9) {
              let s2 = 0;
              if (!t3 && !i9 && 1 === e3.length && (s2 = e3.charCodeAt(0)) < 256) return -9999 !== this._flat[s2] ? this._flat[s2] : this._flat[s2] = this._measure(e3, 0);
              let r11 = e3;
              t3 && (r11 += "B"), i9 && (r11 += "I");
              let n = this._holey.get(r11);
              if (void 0 === n) {
                let s3 = 0;
                t3 && (s3 |= 1), i9 && (s3 |= 2), n = this._measure(e3, s3), this._holey.set(r11, n);
              }
              return n;
            }
            _measure(e3, t3) {
              const i9 = this._measureElements[t3];
              return i9.textContent = e3.repeat(32), i9.offsetWidth / 32;
            }
          };
        }, 2223: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.TEXT_BASELINE = t2.DIM_OPACITY = t2.INVERTED_DEFAULT_COLOR = void 0;
          const s2 = i9(6114);
          t2.INVERTED_DEFAULT_COLOR = 257, t2.DIM_OPACITY = 0.5, t2.TEXT_BASELINE = s2.isFirefox || s2.isLegacyEdge ? "bottom" : "ideographic";
        }, 6171: (e2, t2) => {
          function i9(e3) {
            return 57508 <= e3 && e3 <= 57558;
          }
          Object.defineProperty(t2, "__esModule", { value: true }), t2.createRenderDimensions = t2.excludeFromContrastRatioDemands = t2.isRestrictedPowerlineGlyph = t2.isPowerlineGlyph = t2.throwIfFalsy = void 0, t2.throwIfFalsy = function(e3) {
            if (!e3) throw new Error("value must not be falsy");
            return e3;
          }, t2.isPowerlineGlyph = i9, t2.isRestrictedPowerlineGlyph = function(e3) {
            return 57520 <= e3 && e3 <= 57527;
          }, t2.excludeFromContrastRatioDemands = function(e3) {
            return i9(e3) || (function(e4) {
              return 9472 <= e4 && e4 <= 9631;
            })(e3);
          }, t2.createRenderDimensions = function() {
            return { css: { canvas: { width: 0, height: 0 }, cell: { width: 0, height: 0 } }, device: { canvas: { width: 0, height: 0 }, cell: { width: 0, height: 0 }, char: { width: 0, height: 0, left: 0, top: 0 } } };
          };
        }, 456: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.SelectionModel = void 0, t2.SelectionModel = class {
            constructor(e3) {
              this._bufferService = e3, this.isSelectAllActive = false, this.selectionStartLength = 0;
            }
            clearSelection() {
              this.selectionStart = void 0, this.selectionEnd = void 0, this.isSelectAllActive = false, this.selectionStartLength = 0;
            }
            get finalSelectionStart() {
              return this.isSelectAllActive ? [0, 0] : this.selectionEnd && this.selectionStart && this.areSelectionValuesReversed() ? this.selectionEnd : this.selectionStart;
            }
            get finalSelectionEnd() {
              if (this.isSelectAllActive) return [this._bufferService.cols, this._bufferService.buffer.ybase + this._bufferService.rows - 1];
              if (this.selectionStart) {
                if (!this.selectionEnd || this.areSelectionValuesReversed()) {
                  const e3 = this.selectionStart[0] + this.selectionStartLength;
                  return e3 > this._bufferService.cols ? e3 % this._bufferService.cols == 0 ? [this._bufferService.cols, this.selectionStart[1] + Math.floor(e3 / this._bufferService.cols) - 1] : [e3 % this._bufferService.cols, this.selectionStart[1] + Math.floor(e3 / this._bufferService.cols)] : [e3, this.selectionStart[1]];
                }
                if (this.selectionStartLength && this.selectionEnd[1] === this.selectionStart[1]) {
                  const e3 = this.selectionStart[0] + this.selectionStartLength;
                  return e3 > this._bufferService.cols ? [e3 % this._bufferService.cols, this.selectionStart[1] + Math.floor(e3 / this._bufferService.cols)] : [Math.max(e3, this.selectionEnd[0]), this.selectionEnd[1]];
                }
                return this.selectionEnd;
              }
            }
            areSelectionValuesReversed() {
              const e3 = this.selectionStart, t3 = this.selectionEnd;
              return !(!e3 || !t3) && (e3[1] > t3[1] || e3[1] === t3[1] && e3[0] > t3[0]);
            }
            handleTrim(e3) {
              return this.selectionStart && (this.selectionStart[1] -= e3), this.selectionEnd && (this.selectionEnd[1] -= e3), this.selectionEnd && this.selectionEnd[1] < 0 ? (this.clearSelection(), true) : (this.selectionStart && this.selectionStart[1] < 0 && (this.selectionStart[1] = 0), false);
            }
          };
        }, 428: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.CharSizeService = void 0;
          const n = i9(2585), o2 = i9(8460), a = i9(844);
          let h2 = t2.CharSizeService = class extends a.Disposable {
            get hasValidSize() {
              return this.width > 0 && this.height > 0;
            }
            constructor(e3, t3, i10) {
              super(), this._optionsService = i10, this.width = 0, this.height = 0, this._onCharSizeChange = this.register(new o2.EventEmitter()), this.onCharSizeChange = this._onCharSizeChange.event, this._measureStrategy = new c(e3, t3, this._optionsService), this.register(this._optionsService.onMultipleOptionChange(["fontFamily", "fontSize"], (() => this.measure())));
            }
            measure() {
              const e3 = this._measureStrategy.measure();
              e3.width === this.width && e3.height === this.height || (this.width = e3.width, this.height = e3.height, this._onCharSizeChange.fire());
            }
          };
          t2.CharSizeService = h2 = s2([r11(2, n.IOptionsService)], h2);
          class c {
            constructor(e3, t3, i10) {
              this._document = e3, this._parentElement = t3, this._optionsService = i10, this._result = { width: 0, height: 0 }, this._measureElement = this._document.createElement("span"), this._measureElement.classList.add("xterm-char-measure-element"), this._measureElement.textContent = "W".repeat(32), this._measureElement.setAttribute("aria-hidden", "true"), this._measureElement.style.whiteSpace = "pre", this._measureElement.style.fontKerning = "none", this._parentElement.appendChild(this._measureElement);
            }
            measure() {
              this._measureElement.style.fontFamily = this._optionsService.rawOptions.fontFamily, this._measureElement.style.fontSize = `${this._optionsService.rawOptions.fontSize}px`;
              const e3 = { height: Number(this._measureElement.offsetHeight), width: Number(this._measureElement.offsetWidth) };
              return 0 !== e3.width && 0 !== e3.height && (this._result.width = e3.width / 32, this._result.height = Math.ceil(e3.height)), this._result;
            }
          }
        }, 4269: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.CharacterJoinerService = t2.JoinedCellData = void 0;
          const n = i9(3734), o2 = i9(643), a = i9(511), h2 = i9(2585);
          class c extends n.AttributeData {
            constructor(e3, t3, i10) {
              super(), this.content = 0, this.combinedData = "", this.fg = e3.fg, this.bg = e3.bg, this.combinedData = t3, this._width = i10;
            }
            isCombined() {
              return 2097152;
            }
            getWidth() {
              return this._width;
            }
            getChars() {
              return this.combinedData;
            }
            getCode() {
              return 2097151;
            }
            setFromCharData(e3) {
              throw new Error("not implemented");
            }
            getAsCharData() {
              return [this.fg, this.getChars(), this.getWidth(), this.getCode()];
            }
          }
          t2.JoinedCellData = c;
          let l2 = t2.CharacterJoinerService = class e3 {
            constructor(e4) {
              this._bufferService = e4, this._characterJoiners = [], this._nextCharacterJoinerId = 0, this._workCell = new a.CellData();
            }
            register(e4) {
              const t3 = { id: this._nextCharacterJoinerId++, handler: e4 };
              return this._characterJoiners.push(t3), t3.id;
            }
            deregister(e4) {
              for (let t3 = 0; t3 < this._characterJoiners.length; t3++) if (this._characterJoiners[t3].id === e4) return this._characterJoiners.splice(t3, 1), true;
              return false;
            }
            getJoinedCharacters(e4) {
              if (0 === this._characterJoiners.length) return [];
              const t3 = this._bufferService.buffer.lines.get(e4);
              if (!t3 || 0 === t3.length) return [];
              const i10 = [], s3 = t3.translateToString(true);
              let r12 = 0, n2 = 0, a2 = 0, h3 = t3.getFg(0), c2 = t3.getBg(0);
              for (let e5 = 0; e5 < t3.getTrimmedLength(); e5++) if (t3.loadCell(e5, this._workCell), 0 !== this._workCell.getWidth()) {
                if (this._workCell.fg !== h3 || this._workCell.bg !== c2) {
                  if (e5 - r12 > 1) {
                    const e6 = this._getJoinedRanges(s3, a2, n2, t3, r12);
                    for (let t4 = 0; t4 < e6.length; t4++) i10.push(e6[t4]);
                  }
                  r12 = e5, a2 = n2, h3 = this._workCell.fg, c2 = this._workCell.bg;
                }
                n2 += this._workCell.getChars().length || o2.WHITESPACE_CELL_CHAR.length;
              }
              if (this._bufferService.cols - r12 > 1) {
                const e5 = this._getJoinedRanges(s3, a2, n2, t3, r12);
                for (let t4 = 0; t4 < e5.length; t4++) i10.push(e5[t4]);
              }
              return i10;
            }
            _getJoinedRanges(t3, i10, s3, r12, n2) {
              const o3 = t3.substring(i10, s3);
              let a2 = [];
              try {
                a2 = this._characterJoiners[0].handler(o3);
              } catch (e4) {
                console.error(e4);
              }
              for (let t4 = 1; t4 < this._characterJoiners.length; t4++) try {
                const i11 = this._characterJoiners[t4].handler(o3);
                for (let t5 = 0; t5 < i11.length; t5++) e3._mergeRanges(a2, i11[t5]);
              } catch (e4) {
                console.error(e4);
              }
              return this._stringRangesToCellRanges(a2, r12, n2), a2;
            }
            _stringRangesToCellRanges(e4, t3, i10) {
              let s3 = 0, r12 = false, n2 = 0, a2 = e4[s3];
              if (a2) {
                for (let h3 = i10; h3 < this._bufferService.cols; h3++) {
                  const i11 = t3.getWidth(h3), c2 = t3.getString(h3).length || o2.WHITESPACE_CELL_CHAR.length;
                  if (0 !== i11) {
                    if (!r12 && a2[0] <= n2 && (a2[0] = h3, r12 = true), a2[1] <= n2) {
                      if (a2[1] = h3, a2 = e4[++s3], !a2) break;
                      a2[0] <= n2 ? (a2[0] = h3, r12 = true) : r12 = false;
                    }
                    n2 += c2;
                  }
                }
                a2 && (a2[1] = this._bufferService.cols);
              }
            }
            static _mergeRanges(e4, t3) {
              let i10 = false;
              for (let s3 = 0; s3 < e4.length; s3++) {
                const r12 = e4[s3];
                if (i10) {
                  if (t3[1] <= r12[0]) return e4[s3 - 1][1] = t3[1], e4;
                  if (t3[1] <= r12[1]) return e4[s3 - 1][1] = Math.max(t3[1], r12[1]), e4.splice(s3, 1), e4;
                  e4.splice(s3, 1), s3--;
                } else {
                  if (t3[1] <= r12[0]) return e4.splice(s3, 0, t3), e4;
                  if (t3[1] <= r12[1]) return r12[0] = Math.min(t3[0], r12[0]), e4;
                  t3[0] < r12[1] && (r12[0] = Math.min(t3[0], r12[0]), i10 = true);
                }
              }
              return i10 ? e4[e4.length - 1][1] = t3[1] : e4.push(t3), e4;
            }
          };
          t2.CharacterJoinerService = l2 = s2([r11(0, h2.IBufferService)], l2);
        }, 5114: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.CoreBrowserService = void 0, t2.CoreBrowserService = class {
            constructor(e3, t3) {
              this._textarea = e3, this.window = t3, this._isFocused = false, this._cachedIsFocused = void 0, this._textarea.addEventListener("focus", (() => this._isFocused = true)), this._textarea.addEventListener("blur", (() => this._isFocused = false));
            }
            get dpr() {
              return this.window.devicePixelRatio;
            }
            get isFocused() {
              return void 0 === this._cachedIsFocused && (this._cachedIsFocused = this._isFocused && this._textarea.ownerDocument.hasFocus(), queueMicrotask((() => this._cachedIsFocused = void 0))), this._cachedIsFocused;
            }
          };
        }, 8934: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.MouseService = void 0;
          const n = i9(4725), o2 = i9(9806);
          let a = t2.MouseService = class {
            constructor(e3, t3) {
              this._renderService = e3, this._charSizeService = t3;
            }
            getCoords(e3, t3, i10, s3, r12) {
              return (0, o2.getCoords)(window, e3, t3, i10, s3, this._charSizeService.hasValidSize, this._renderService.dimensions.css.cell.width, this._renderService.dimensions.css.cell.height, r12);
            }
            getMouseReportCoords(e3, t3) {
              const i10 = (0, o2.getCoordsRelativeToElement)(window, e3, t3);
              if (this._charSizeService.hasValidSize) return i10[0] = Math.min(Math.max(i10[0], 0), this._renderService.dimensions.css.canvas.width - 1), i10[1] = Math.min(Math.max(i10[1], 0), this._renderService.dimensions.css.canvas.height - 1), { col: Math.floor(i10[0] / this._renderService.dimensions.css.cell.width), row: Math.floor(i10[1] / this._renderService.dimensions.css.cell.height), x: Math.floor(i10[0]), y: Math.floor(i10[1]) };
            }
          };
          t2.MouseService = a = s2([r11(0, n.IRenderService), r11(1, n.ICharSizeService)], a);
        }, 3230: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.RenderService = void 0;
          const n = i9(3656), o2 = i9(6193), a = i9(5596), h2 = i9(4725), c = i9(8460), l2 = i9(844), d = i9(7226), _4 = i9(2585);
          let u = t2.RenderService = class extends l2.Disposable {
            get dimensions() {
              return this._renderer.value.dimensions;
            }
            constructor(e3, t3, i10, s3, r12, h3, _5, u2) {
              if (super(), this._rowCount = e3, this._charSizeService = s3, this._renderer = this.register(new l2.MutableDisposable()), this._pausedResizeTask = new d.DebouncedIdleTask(), this._isPaused = false, this._needsFullRefresh = false, this._isNextRenderRedrawOnly = true, this._needsSelectionRefresh = false, this._canvasWidth = 0, this._canvasHeight = 0, this._selectionState = { start: void 0, end: void 0, columnSelectMode: false }, this._onDimensionsChange = this.register(new c.EventEmitter()), this.onDimensionsChange = this._onDimensionsChange.event, this._onRenderedViewportChange = this.register(new c.EventEmitter()), this.onRenderedViewportChange = this._onRenderedViewportChange.event, this._onRender = this.register(new c.EventEmitter()), this.onRender = this._onRender.event, this._onRefreshRequest = this.register(new c.EventEmitter()), this.onRefreshRequest = this._onRefreshRequest.event, this._renderDebouncer = new o2.RenderDebouncer(_5.window, ((e4, t4) => this._renderRows(e4, t4))), this.register(this._renderDebouncer), this._screenDprMonitor = new a.ScreenDprMonitor(_5.window), this._screenDprMonitor.setListener((() => this.handleDevicePixelRatioChange())), this.register(this._screenDprMonitor), this.register(h3.onResize((() => this._fullRefresh()))), this.register(h3.buffers.onBufferActivate((() => {
                var e4;
                return null === (e4 = this._renderer.value) || void 0 === e4 ? void 0 : e4.clear();
              }))), this.register(i10.onOptionChange((() => this._handleOptionsChanged()))), this.register(this._charSizeService.onCharSizeChange((() => this.handleCharSizeChanged()))), this.register(r12.onDecorationRegistered((() => this._fullRefresh()))), this.register(r12.onDecorationRemoved((() => this._fullRefresh()))), this.register(i10.onMultipleOptionChange(["customGlyphs", "drawBoldTextInBrightColors", "letterSpacing", "lineHeight", "fontFamily", "fontSize", "fontWeight", "fontWeightBold", "minimumContrastRatio"], (() => {
                this.clear(), this.handleResize(h3.cols, h3.rows), this._fullRefresh();
              }))), this.register(i10.onMultipleOptionChange(["cursorBlink", "cursorStyle"], (() => this.refreshRows(h3.buffer.y, h3.buffer.y, true)))), this.register((0, n.addDisposableDomListener)(_5.window, "resize", (() => this.handleDevicePixelRatioChange()))), this.register(u2.onChangeColors((() => this._fullRefresh()))), "IntersectionObserver" in _5.window) {
                const e4 = new _5.window.IntersectionObserver(((e5) => this._handleIntersectionChange(e5[e5.length - 1])), { threshold: 0 });
                e4.observe(t3), this.register({ dispose: () => e4.disconnect() });
              }
            }
            _handleIntersectionChange(e3) {
              this._isPaused = void 0 === e3.isIntersecting ? 0 === e3.intersectionRatio : !e3.isIntersecting, this._isPaused || this._charSizeService.hasValidSize || this._charSizeService.measure(), !this._isPaused && this._needsFullRefresh && (this._pausedResizeTask.flush(), this.refreshRows(0, this._rowCount - 1), this._needsFullRefresh = false);
            }
            refreshRows(e3, t3, i10 = false) {
              this._isPaused ? this._needsFullRefresh = true : (i10 || (this._isNextRenderRedrawOnly = false), this._renderDebouncer.refresh(e3, t3, this._rowCount));
            }
            _renderRows(e3, t3) {
              this._renderer.value && (e3 = Math.min(e3, this._rowCount - 1), t3 = Math.min(t3, this._rowCount - 1), this._renderer.value.renderRows(e3, t3), this._needsSelectionRefresh && (this._renderer.value.handleSelectionChanged(this._selectionState.start, this._selectionState.end, this._selectionState.columnSelectMode), this._needsSelectionRefresh = false), this._isNextRenderRedrawOnly || this._onRenderedViewportChange.fire({ start: e3, end: t3 }), this._onRender.fire({ start: e3, end: t3 }), this._isNextRenderRedrawOnly = true);
            }
            resize(e3, t3) {
              this._rowCount = t3, this._fireOnCanvasResize();
            }
            _handleOptionsChanged() {
              this._renderer.value && (this.refreshRows(0, this._rowCount - 1), this._fireOnCanvasResize());
            }
            _fireOnCanvasResize() {
              this._renderer.value && (this._renderer.value.dimensions.css.canvas.width === this._canvasWidth && this._renderer.value.dimensions.css.canvas.height === this._canvasHeight || this._onDimensionsChange.fire(this._renderer.value.dimensions));
            }
            hasRenderer() {
              return !!this._renderer.value;
            }
            setRenderer(e3) {
              this._renderer.value = e3, this._renderer.value.onRequestRedraw(((e4) => this.refreshRows(e4.start, e4.end, true))), this._needsSelectionRefresh = true, this._fullRefresh();
            }
            addRefreshCallback(e3) {
              return this._renderDebouncer.addRefreshCallback(e3);
            }
            _fullRefresh() {
              this._isPaused ? this._needsFullRefresh = true : this.refreshRows(0, this._rowCount - 1);
            }
            clearTextureAtlas() {
              var e3, t3;
              this._renderer.value && (null === (t3 = (e3 = this._renderer.value).clearTextureAtlas) || void 0 === t3 || t3.call(e3), this._fullRefresh());
            }
            handleDevicePixelRatioChange() {
              this._charSizeService.measure(), this._renderer.value && (this._renderer.value.handleDevicePixelRatioChange(), this.refreshRows(0, this._rowCount - 1));
            }
            handleResize(e3, t3) {
              this._renderer.value && (this._isPaused ? this._pausedResizeTask.set((() => this._renderer.value.handleResize(e3, t3))) : this._renderer.value.handleResize(e3, t3), this._fullRefresh());
            }
            handleCharSizeChanged() {
              var e3;
              null === (e3 = this._renderer.value) || void 0 === e3 || e3.handleCharSizeChanged();
            }
            handleBlur() {
              var e3;
              null === (e3 = this._renderer.value) || void 0 === e3 || e3.handleBlur();
            }
            handleFocus() {
              var e3;
              null === (e3 = this._renderer.value) || void 0 === e3 || e3.handleFocus();
            }
            handleSelectionChanged(e3, t3, i10) {
              var s3;
              this._selectionState.start = e3, this._selectionState.end = t3, this._selectionState.columnSelectMode = i10, null === (s3 = this._renderer.value) || void 0 === s3 || s3.handleSelectionChanged(e3, t3, i10);
            }
            handleCursorMove() {
              var e3;
              null === (e3 = this._renderer.value) || void 0 === e3 || e3.handleCursorMove();
            }
            clear() {
              var e3;
              null === (e3 = this._renderer.value) || void 0 === e3 || e3.clear();
            }
          };
          t2.RenderService = u = s2([r11(2, _4.IOptionsService), r11(3, h2.ICharSizeService), r11(4, _4.IDecorationService), r11(5, _4.IBufferService), r11(6, h2.ICoreBrowserService), r11(7, h2.IThemeService)], u);
        }, 9312: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.SelectionService = void 0;
          const n = i9(9806), o2 = i9(9504), a = i9(456), h2 = i9(4725), c = i9(8460), l2 = i9(844), d = i9(6114), _4 = i9(4841), u = i9(511), f = i9(2585), v3 = String.fromCharCode(160), p = new RegExp(v3, "g");
          let g2 = t2.SelectionService = class extends l2.Disposable {
            constructor(e3, t3, i10, s3, r12, n2, o3, h3, d2) {
              super(), this._element = e3, this._screenElement = t3, this._linkifier = i10, this._bufferService = s3, this._coreService = r12, this._mouseService = n2, this._optionsService = o3, this._renderService = h3, this._coreBrowserService = d2, this._dragScrollAmount = 0, this._enabled = true, this._workCell = new u.CellData(), this._mouseDownTimeStamp = 0, this._oldHasSelection = false, this._oldSelectionStart = void 0, this._oldSelectionEnd = void 0, this._onLinuxMouseSelection = this.register(new c.EventEmitter()), this.onLinuxMouseSelection = this._onLinuxMouseSelection.event, this._onRedrawRequest = this.register(new c.EventEmitter()), this.onRequestRedraw = this._onRedrawRequest.event, this._onSelectionChange = this.register(new c.EventEmitter()), this.onSelectionChange = this._onSelectionChange.event, this._onRequestScrollLines = this.register(new c.EventEmitter()), this.onRequestScrollLines = this._onRequestScrollLines.event, this._mouseMoveListener = (e4) => this._handleMouseMove(e4), this._mouseUpListener = (e4) => this._handleMouseUp(e4), this._coreService.onUserInput((() => {
                this.hasSelection && this.clearSelection();
              })), this._trimListener = this._bufferService.buffer.lines.onTrim(((e4) => this._handleTrim(e4))), this.register(this._bufferService.buffers.onBufferActivate(((e4) => this._handleBufferActivate(e4)))), this.enable(), this._model = new a.SelectionModel(this._bufferService), this._activeSelectionMode = 0, this.register((0, l2.toDisposable)((() => {
                this._removeMouseDownListeners();
              })));
            }
            reset() {
              this.clearSelection();
            }
            disable() {
              this.clearSelection(), this._enabled = false;
            }
            enable() {
              this._enabled = true;
            }
            get selectionStart() {
              return this._model.finalSelectionStart;
            }
            get selectionEnd() {
              return this._model.finalSelectionEnd;
            }
            get hasSelection() {
              const e3 = this._model.finalSelectionStart, t3 = this._model.finalSelectionEnd;
              return !(!e3 || !t3 || e3[0] === t3[0] && e3[1] === t3[1]);
            }
            get selectionText() {
              const e3 = this._model.finalSelectionStart, t3 = this._model.finalSelectionEnd;
              if (!e3 || !t3) return "";
              const i10 = this._bufferService.buffer, s3 = [];
              if (3 === this._activeSelectionMode) {
                if (e3[0] === t3[0]) return "";
                const r12 = e3[0] < t3[0] ? e3[0] : t3[0], n2 = e3[0] < t3[0] ? t3[0] : e3[0];
                for (let o3 = e3[1]; o3 <= t3[1]; o3++) {
                  const e4 = i10.translateBufferLineToString(o3, true, r12, n2);
                  s3.push(e4);
                }
              } else {
                const r12 = e3[1] === t3[1] ? t3[0] : void 0;
                s3.push(i10.translateBufferLineToString(e3[1], true, e3[0], r12));
                for (let r13 = e3[1] + 1; r13 <= t3[1] - 1; r13++) {
                  const e4 = i10.lines.get(r13), t4 = i10.translateBufferLineToString(r13, true);
                  (null == e4 ? void 0 : e4.isWrapped) ? s3[s3.length - 1] += t4 : s3.push(t4);
                }
                if (e3[1] !== t3[1]) {
                  const e4 = i10.lines.get(t3[1]), r13 = i10.translateBufferLineToString(t3[1], true, 0, t3[0]);
                  e4 && e4.isWrapped ? s3[s3.length - 1] += r13 : s3.push(r13);
                }
              }
              return s3.map(((e4) => e4.replace(p, " "))).join(d.isWindows ? "\r\n" : "\n");
            }
            clearSelection() {
              this._model.clearSelection(), this._removeMouseDownListeners(), this.refresh(), this._onSelectionChange.fire();
            }
            refresh(e3) {
              this._refreshAnimationFrame || (this._refreshAnimationFrame = this._coreBrowserService.window.requestAnimationFrame((() => this._refresh()))), d.isLinux && e3 && this.selectionText.length && this._onLinuxMouseSelection.fire(this.selectionText);
            }
            _refresh() {
              this._refreshAnimationFrame = void 0, this._onRedrawRequest.fire({ start: this._model.finalSelectionStart, end: this._model.finalSelectionEnd, columnSelectMode: 3 === this._activeSelectionMode });
            }
            _isClickInSelection(e3) {
              const t3 = this._getMouseBufferCoords(e3), i10 = this._model.finalSelectionStart, s3 = this._model.finalSelectionEnd;
              return !!(i10 && s3 && t3) && this._areCoordsInSelection(t3, i10, s3);
            }
            isCellInSelection(e3, t3) {
              const i10 = this._model.finalSelectionStart, s3 = this._model.finalSelectionEnd;
              return !(!i10 || !s3) && this._areCoordsInSelection([e3, t3], i10, s3);
            }
            _areCoordsInSelection(e3, t3, i10) {
              return e3[1] > t3[1] && e3[1] < i10[1] || t3[1] === i10[1] && e3[1] === t3[1] && e3[0] >= t3[0] && e3[0] < i10[0] || t3[1] < i10[1] && e3[1] === i10[1] && e3[0] < i10[0] || t3[1] < i10[1] && e3[1] === t3[1] && e3[0] >= t3[0];
            }
            _selectWordAtCursor(e3, t3) {
              var i10, s3;
              const r12 = null === (s3 = null === (i10 = this._linkifier.currentLink) || void 0 === i10 ? void 0 : i10.link) || void 0 === s3 ? void 0 : s3.range;
              if (r12) return this._model.selectionStart = [r12.start.x - 1, r12.start.y - 1], this._model.selectionStartLength = (0, _4.getRangeLength)(r12, this._bufferService.cols), this._model.selectionEnd = void 0, true;
              const n2 = this._getMouseBufferCoords(e3);
              return !!n2 && (this._selectWordAt(n2, t3), this._model.selectionEnd = void 0, true);
            }
            selectAll() {
              this._model.isSelectAllActive = true, this.refresh(), this._onSelectionChange.fire();
            }
            selectLines(e3, t3) {
              this._model.clearSelection(), e3 = Math.max(e3, 0), t3 = Math.min(t3, this._bufferService.buffer.lines.length - 1), this._model.selectionStart = [0, e3], this._model.selectionEnd = [this._bufferService.cols, t3], this.refresh(), this._onSelectionChange.fire();
            }
            _handleTrim(e3) {
              this._model.handleTrim(e3) && this.refresh();
            }
            _getMouseBufferCoords(e3) {
              const t3 = this._mouseService.getCoords(e3, this._screenElement, this._bufferService.cols, this._bufferService.rows, true);
              if (t3) return t3[0]--, t3[1]--, t3[1] += this._bufferService.buffer.ydisp, t3;
            }
            _getMouseEventScrollAmount(e3) {
              let t3 = (0, n.getCoordsRelativeToElement)(this._coreBrowserService.window, e3, this._screenElement)[1];
              const i10 = this._renderService.dimensions.css.canvas.height;
              return t3 >= 0 && t3 <= i10 ? 0 : (t3 > i10 && (t3 -= i10), t3 = Math.min(Math.max(t3, -50), 50), t3 /= 50, t3 / Math.abs(t3) + Math.round(14 * t3));
            }
            shouldForceSelection(e3) {
              return d.isMac ? e3.altKey && this._optionsService.rawOptions.macOptionClickForcesSelection : e3.shiftKey;
            }
            handleMouseDown(e3) {
              if (this._mouseDownTimeStamp = e3.timeStamp, (2 !== e3.button || !this.hasSelection) && 0 === e3.button) {
                if (!this._enabled) {
                  if (!this.shouldForceSelection(e3)) return;
                  e3.stopPropagation();
                }
                e3.preventDefault(), this._dragScrollAmount = 0, this._enabled && e3.shiftKey ? this._handleIncrementalClick(e3) : 1 === e3.detail ? this._handleSingleClick(e3) : 2 === e3.detail ? this._handleDoubleClick(e3) : 3 === e3.detail && this._handleTripleClick(e3), this._addMouseDownListeners(), this.refresh(true);
              }
            }
            _addMouseDownListeners() {
              this._screenElement.ownerDocument && (this._screenElement.ownerDocument.addEventListener("mousemove", this._mouseMoveListener), this._screenElement.ownerDocument.addEventListener("mouseup", this._mouseUpListener)), this._dragScrollIntervalTimer = this._coreBrowserService.window.setInterval((() => this._dragScroll()), 50);
            }
            _removeMouseDownListeners() {
              this._screenElement.ownerDocument && (this._screenElement.ownerDocument.removeEventListener("mousemove", this._mouseMoveListener), this._screenElement.ownerDocument.removeEventListener("mouseup", this._mouseUpListener)), this._coreBrowserService.window.clearInterval(this._dragScrollIntervalTimer), this._dragScrollIntervalTimer = void 0;
            }
            _handleIncrementalClick(e3) {
              this._model.selectionStart && (this._model.selectionEnd = this._getMouseBufferCoords(e3));
            }
            _handleSingleClick(e3) {
              if (this._model.selectionStartLength = 0, this._model.isSelectAllActive = false, this._activeSelectionMode = this.shouldColumnSelect(e3) ? 3 : 0, this._model.selectionStart = this._getMouseBufferCoords(e3), !this._model.selectionStart) return;
              this._model.selectionEnd = void 0;
              const t3 = this._bufferService.buffer.lines.get(this._model.selectionStart[1]);
              t3 && t3.length !== this._model.selectionStart[0] && 0 === t3.hasWidth(this._model.selectionStart[0]) && this._model.selectionStart[0]++;
            }
            _handleDoubleClick(e3) {
              this._selectWordAtCursor(e3, true) && (this._activeSelectionMode = 1);
            }
            _handleTripleClick(e3) {
              const t3 = this._getMouseBufferCoords(e3);
              t3 && (this._activeSelectionMode = 2, this._selectLineAt(t3[1]));
            }
            shouldColumnSelect(e3) {
              return e3.altKey && !(d.isMac && this._optionsService.rawOptions.macOptionClickForcesSelection);
            }
            _handleMouseMove(e3) {
              if (e3.stopImmediatePropagation(), !this._model.selectionStart) return;
              const t3 = this._model.selectionEnd ? [this._model.selectionEnd[0], this._model.selectionEnd[1]] : null;
              if (this._model.selectionEnd = this._getMouseBufferCoords(e3), !this._model.selectionEnd) return void this.refresh(true);
              2 === this._activeSelectionMode ? this._model.selectionEnd[1] < this._model.selectionStart[1] ? this._model.selectionEnd[0] = 0 : this._model.selectionEnd[0] = this._bufferService.cols : 1 === this._activeSelectionMode && this._selectToWordAt(this._model.selectionEnd), this._dragScrollAmount = this._getMouseEventScrollAmount(e3), 3 !== this._activeSelectionMode && (this._dragScrollAmount > 0 ? this._model.selectionEnd[0] = this._bufferService.cols : this._dragScrollAmount < 0 && (this._model.selectionEnd[0] = 0));
              const i10 = this._bufferService.buffer;
              if (this._model.selectionEnd[1] < i10.lines.length) {
                const e4 = i10.lines.get(this._model.selectionEnd[1]);
                e4 && 0 === e4.hasWidth(this._model.selectionEnd[0]) && this._model.selectionEnd[0]++;
              }
              t3 && t3[0] === this._model.selectionEnd[0] && t3[1] === this._model.selectionEnd[1] || this.refresh(true);
            }
            _dragScroll() {
              if (this._model.selectionEnd && this._model.selectionStart && this._dragScrollAmount) {
                this._onRequestScrollLines.fire({ amount: this._dragScrollAmount, suppressScrollEvent: false });
                const e3 = this._bufferService.buffer;
                this._dragScrollAmount > 0 ? (3 !== this._activeSelectionMode && (this._model.selectionEnd[0] = this._bufferService.cols), this._model.selectionEnd[1] = Math.min(e3.ydisp + this._bufferService.rows, e3.lines.length - 1)) : (3 !== this._activeSelectionMode && (this._model.selectionEnd[0] = 0), this._model.selectionEnd[1] = e3.ydisp), this.refresh();
              }
            }
            _handleMouseUp(e3) {
              const t3 = e3.timeStamp - this._mouseDownTimeStamp;
              if (this._removeMouseDownListeners(), this.selectionText.length <= 1 && t3 < 500 && e3.altKey && this._optionsService.rawOptions.altClickMovesCursor) {
                if (this._bufferService.buffer.ybase === this._bufferService.buffer.ydisp) {
                  const t4 = this._mouseService.getCoords(e3, this._element, this._bufferService.cols, this._bufferService.rows, false);
                  if (t4 && void 0 !== t4[0] && void 0 !== t4[1]) {
                    const e4 = (0, o2.moveToCellSequence)(t4[0] - 1, t4[1] - 1, this._bufferService, this._coreService.decPrivateModes.applicationCursorKeys);
                    this._coreService.triggerDataEvent(e4, true);
                  }
                }
              } else this._fireEventIfSelectionChanged();
            }
            _fireEventIfSelectionChanged() {
              const e3 = this._model.finalSelectionStart, t3 = this._model.finalSelectionEnd, i10 = !(!e3 || !t3 || e3[0] === t3[0] && e3[1] === t3[1]);
              i10 ? e3 && t3 && (this._oldSelectionStart && this._oldSelectionEnd && e3[0] === this._oldSelectionStart[0] && e3[1] === this._oldSelectionStart[1] && t3[0] === this._oldSelectionEnd[0] && t3[1] === this._oldSelectionEnd[1] || this._fireOnSelectionChange(e3, t3, i10)) : this._oldHasSelection && this._fireOnSelectionChange(e3, t3, i10);
            }
            _fireOnSelectionChange(e3, t3, i10) {
              this._oldSelectionStart = e3, this._oldSelectionEnd = t3, this._oldHasSelection = i10, this._onSelectionChange.fire();
            }
            _handleBufferActivate(e3) {
              this.clearSelection(), this._trimListener.dispose(), this._trimListener = e3.activeBuffer.lines.onTrim(((e4) => this._handleTrim(e4)));
            }
            _convertViewportColToCharacterIndex(e3, t3) {
              let i10 = t3;
              for (let s3 = 0; t3 >= s3; s3++) {
                const r12 = e3.loadCell(s3, this._workCell).getChars().length;
                0 === this._workCell.getWidth() ? i10-- : r12 > 1 && t3 !== s3 && (i10 += r12 - 1);
              }
              return i10;
            }
            setSelection(e3, t3, i10) {
              this._model.clearSelection(), this._removeMouseDownListeners(), this._model.selectionStart = [e3, t3], this._model.selectionStartLength = i10, this.refresh(), this._fireEventIfSelectionChanged();
            }
            rightClickSelect(e3) {
              this._isClickInSelection(e3) || (this._selectWordAtCursor(e3, false) && this.refresh(true), this._fireEventIfSelectionChanged());
            }
            _getWordAt(e3, t3, i10 = true, s3 = true) {
              if (e3[0] >= this._bufferService.cols) return;
              const r12 = this._bufferService.buffer, n2 = r12.lines.get(e3[1]);
              if (!n2) return;
              const o3 = r12.translateBufferLineToString(e3[1], false);
              let a2 = this._convertViewportColToCharacterIndex(n2, e3[0]), h3 = a2;
              const c2 = e3[0] - a2;
              let l3 = 0, d2 = 0, _5 = 0, u2 = 0;
              if (" " === o3.charAt(a2)) {
                for (; a2 > 0 && " " === o3.charAt(a2 - 1); ) a2--;
                for (; h3 < o3.length && " " === o3.charAt(h3 + 1); ) h3++;
              } else {
                let t4 = e3[0], i11 = e3[0];
                0 === n2.getWidth(t4) && (l3++, t4--), 2 === n2.getWidth(i11) && (d2++, i11++);
                const s4 = n2.getString(i11).length;
                for (s4 > 1 && (u2 += s4 - 1, h3 += s4 - 1); t4 > 0 && a2 > 0 && !this._isCharWordSeparator(n2.loadCell(t4 - 1, this._workCell)); ) {
                  n2.loadCell(t4 - 1, this._workCell);
                  const e4 = this._workCell.getChars().length;
                  0 === this._workCell.getWidth() ? (l3++, t4--) : e4 > 1 && (_5 += e4 - 1, a2 -= e4 - 1), a2--, t4--;
                }
                for (; i11 < n2.length && h3 + 1 < o3.length && !this._isCharWordSeparator(n2.loadCell(i11 + 1, this._workCell)); ) {
                  n2.loadCell(i11 + 1, this._workCell);
                  const e4 = this._workCell.getChars().length;
                  2 === this._workCell.getWidth() ? (d2++, i11++) : e4 > 1 && (u2 += e4 - 1, h3 += e4 - 1), h3++, i11++;
                }
              }
              h3++;
              let f2 = a2 + c2 - l3 + _5, v4 = Math.min(this._bufferService.cols, h3 - a2 + l3 + d2 - _5 - u2);
              if (t3 || "" !== o3.slice(a2, h3).trim()) {
                if (i10 && 0 === f2 && 32 !== n2.getCodePoint(0)) {
                  const t4 = r12.lines.get(e3[1] - 1);
                  if (t4 && n2.isWrapped && 32 !== t4.getCodePoint(this._bufferService.cols - 1)) {
                    const t5 = this._getWordAt([this._bufferService.cols - 1, e3[1] - 1], false, true, false);
                    if (t5) {
                      const e4 = this._bufferService.cols - t5.start;
                      f2 -= e4, v4 += e4;
                    }
                  }
                }
                if (s3 && f2 + v4 === this._bufferService.cols && 32 !== n2.getCodePoint(this._bufferService.cols - 1)) {
                  const t4 = r12.lines.get(e3[1] + 1);
                  if ((null == t4 ? void 0 : t4.isWrapped) && 32 !== t4.getCodePoint(0)) {
                    const t5 = this._getWordAt([0, e3[1] + 1], false, false, true);
                    t5 && (v4 += t5.length);
                  }
                }
                return { start: f2, length: v4 };
              }
            }
            _selectWordAt(e3, t3) {
              const i10 = this._getWordAt(e3, t3);
              if (i10) {
                for (; i10.start < 0; ) i10.start += this._bufferService.cols, e3[1]--;
                this._model.selectionStart = [i10.start, e3[1]], this._model.selectionStartLength = i10.length;
              }
            }
            _selectToWordAt(e3) {
              const t3 = this._getWordAt(e3, true);
              if (t3) {
                let i10 = e3[1];
                for (; t3.start < 0; ) t3.start += this._bufferService.cols, i10--;
                if (!this._model.areSelectionValuesReversed()) for (; t3.start + t3.length > this._bufferService.cols; ) t3.length -= this._bufferService.cols, i10++;
                this._model.selectionEnd = [this._model.areSelectionValuesReversed() ? t3.start : t3.start + t3.length, i10];
              }
            }
            _isCharWordSeparator(e3) {
              return 0 !== e3.getWidth() && this._optionsService.rawOptions.wordSeparator.indexOf(e3.getChars()) >= 0;
            }
            _selectLineAt(e3) {
              const t3 = this._bufferService.buffer.getWrappedRangeForLine(e3), i10 = { start: { x: 0, y: t3.first }, end: { x: this._bufferService.cols - 1, y: t3.last } };
              this._model.selectionStart = [0, t3.first], this._model.selectionEnd = void 0, this._model.selectionStartLength = (0, _4.getRangeLength)(i10, this._bufferService.cols);
            }
          };
          t2.SelectionService = g2 = s2([r11(3, f.IBufferService), r11(4, f.ICoreService), r11(5, h2.IMouseService), r11(6, f.IOptionsService), r11(7, h2.IRenderService), r11(8, h2.ICoreBrowserService)], g2);
        }, 4725: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.IThemeService = t2.ICharacterJoinerService = t2.ISelectionService = t2.IRenderService = t2.IMouseService = t2.ICoreBrowserService = t2.ICharSizeService = void 0;
          const s2 = i9(8343);
          t2.ICharSizeService = (0, s2.createDecorator)("CharSizeService"), t2.ICoreBrowserService = (0, s2.createDecorator)("CoreBrowserService"), t2.IMouseService = (0, s2.createDecorator)("MouseService"), t2.IRenderService = (0, s2.createDecorator)("RenderService"), t2.ISelectionService = (0, s2.createDecorator)("SelectionService"), t2.ICharacterJoinerService = (0, s2.createDecorator)("CharacterJoinerService"), t2.IThemeService = (0, s2.createDecorator)("ThemeService");
        }, 6731: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.ThemeService = t2.DEFAULT_ANSI_COLORS = void 0;
          const n = i9(7239), o2 = i9(8055), a = i9(8460), h2 = i9(844), c = i9(2585), l2 = o2.css.toColor("#ffffff"), d = o2.css.toColor("#000000"), _4 = o2.css.toColor("#ffffff"), u = o2.css.toColor("#000000"), f = { css: "rgba(255, 255, 255, 0.3)", rgba: 4294967117 };
          t2.DEFAULT_ANSI_COLORS = Object.freeze((() => {
            const e3 = [o2.css.toColor("#2e3436"), o2.css.toColor("#cc0000"), o2.css.toColor("#4e9a06"), o2.css.toColor("#c4a000"), o2.css.toColor("#3465a4"), o2.css.toColor("#75507b"), o2.css.toColor("#06989a"), o2.css.toColor("#d3d7cf"), o2.css.toColor("#555753"), o2.css.toColor("#ef2929"), o2.css.toColor("#8ae234"), o2.css.toColor("#fce94f"), o2.css.toColor("#729fcf"), o2.css.toColor("#ad7fa8"), o2.css.toColor("#34e2e2"), o2.css.toColor("#eeeeec")], t3 = [0, 95, 135, 175, 215, 255];
            for (let i10 = 0; i10 < 216; i10++) {
              const s3 = t3[i10 / 36 % 6 | 0], r12 = t3[i10 / 6 % 6 | 0], n2 = t3[i10 % 6];
              e3.push({ css: o2.channels.toCss(s3, r12, n2), rgba: o2.channels.toRgba(s3, r12, n2) });
            }
            for (let t4 = 0; t4 < 24; t4++) {
              const i10 = 8 + 10 * t4;
              e3.push({ css: o2.channels.toCss(i10, i10, i10), rgba: o2.channels.toRgba(i10, i10, i10) });
            }
            return e3;
          })());
          let v3 = t2.ThemeService = class extends h2.Disposable {
            get colors() {
              return this._colors;
            }
            constructor(e3) {
              super(), this._optionsService = e3, this._contrastCache = new n.ColorContrastCache(), this._halfContrastCache = new n.ColorContrastCache(), this._onChangeColors = this.register(new a.EventEmitter()), this.onChangeColors = this._onChangeColors.event, this._colors = { foreground: l2, background: d, cursor: _4, cursorAccent: u, selectionForeground: void 0, selectionBackgroundTransparent: f, selectionBackgroundOpaque: o2.color.blend(d, f), selectionInactiveBackgroundTransparent: f, selectionInactiveBackgroundOpaque: o2.color.blend(d, f), ansi: t2.DEFAULT_ANSI_COLORS.slice(), contrastCache: this._contrastCache, halfContrastCache: this._halfContrastCache }, this._updateRestoreColors(), this._setTheme(this._optionsService.rawOptions.theme), this.register(this._optionsService.onSpecificOptionChange("minimumContrastRatio", (() => this._contrastCache.clear()))), this.register(this._optionsService.onSpecificOptionChange("theme", (() => this._setTheme(this._optionsService.rawOptions.theme))));
            }
            _setTheme(e3 = {}) {
              const i10 = this._colors;
              if (i10.foreground = p(e3.foreground, l2), i10.background = p(e3.background, d), i10.cursor = p(e3.cursor, _4), i10.cursorAccent = p(e3.cursorAccent, u), i10.selectionBackgroundTransparent = p(e3.selectionBackground, f), i10.selectionBackgroundOpaque = o2.color.blend(i10.background, i10.selectionBackgroundTransparent), i10.selectionInactiveBackgroundTransparent = p(e3.selectionInactiveBackground, i10.selectionBackgroundTransparent), i10.selectionInactiveBackgroundOpaque = o2.color.blend(i10.background, i10.selectionInactiveBackgroundTransparent), i10.selectionForeground = e3.selectionForeground ? p(e3.selectionForeground, o2.NULL_COLOR) : void 0, i10.selectionForeground === o2.NULL_COLOR && (i10.selectionForeground = void 0), o2.color.isOpaque(i10.selectionBackgroundTransparent)) {
                const e4 = 0.3;
                i10.selectionBackgroundTransparent = o2.color.opacity(i10.selectionBackgroundTransparent, e4);
              }
              if (o2.color.isOpaque(i10.selectionInactiveBackgroundTransparent)) {
                const e4 = 0.3;
                i10.selectionInactiveBackgroundTransparent = o2.color.opacity(i10.selectionInactiveBackgroundTransparent, e4);
              }
              if (i10.ansi = t2.DEFAULT_ANSI_COLORS.slice(), i10.ansi[0] = p(e3.black, t2.DEFAULT_ANSI_COLORS[0]), i10.ansi[1] = p(e3.red, t2.DEFAULT_ANSI_COLORS[1]), i10.ansi[2] = p(e3.green, t2.DEFAULT_ANSI_COLORS[2]), i10.ansi[3] = p(e3.yellow, t2.DEFAULT_ANSI_COLORS[3]), i10.ansi[4] = p(e3.blue, t2.DEFAULT_ANSI_COLORS[4]), i10.ansi[5] = p(e3.magenta, t2.DEFAULT_ANSI_COLORS[5]), i10.ansi[6] = p(e3.cyan, t2.DEFAULT_ANSI_COLORS[6]), i10.ansi[7] = p(e3.white, t2.DEFAULT_ANSI_COLORS[7]), i10.ansi[8] = p(e3.brightBlack, t2.DEFAULT_ANSI_COLORS[8]), i10.ansi[9] = p(e3.brightRed, t2.DEFAULT_ANSI_COLORS[9]), i10.ansi[10] = p(e3.brightGreen, t2.DEFAULT_ANSI_COLORS[10]), i10.ansi[11] = p(e3.brightYellow, t2.DEFAULT_ANSI_COLORS[11]), i10.ansi[12] = p(e3.brightBlue, t2.DEFAULT_ANSI_COLORS[12]), i10.ansi[13] = p(e3.brightMagenta, t2.DEFAULT_ANSI_COLORS[13]), i10.ansi[14] = p(e3.brightCyan, t2.DEFAULT_ANSI_COLORS[14]), i10.ansi[15] = p(e3.brightWhite, t2.DEFAULT_ANSI_COLORS[15]), e3.extendedAnsi) {
                const s3 = Math.min(i10.ansi.length - 16, e3.extendedAnsi.length);
                for (let r12 = 0; r12 < s3; r12++) i10.ansi[r12 + 16] = p(e3.extendedAnsi[r12], t2.DEFAULT_ANSI_COLORS[r12 + 16]);
              }
              this._contrastCache.clear(), this._halfContrastCache.clear(), this._updateRestoreColors(), this._onChangeColors.fire(this.colors);
            }
            restoreColor(e3) {
              this._restoreColor(e3), this._onChangeColors.fire(this.colors);
            }
            _restoreColor(e3) {
              if (void 0 !== e3) switch (e3) {
                case 256:
                  this._colors.foreground = this._restoreColors.foreground;
                  break;
                case 257:
                  this._colors.background = this._restoreColors.background;
                  break;
                case 258:
                  this._colors.cursor = this._restoreColors.cursor;
                  break;
                default:
                  this._colors.ansi[e3] = this._restoreColors.ansi[e3];
              }
              else for (let e4 = 0; e4 < this._restoreColors.ansi.length; ++e4) this._colors.ansi[e4] = this._restoreColors.ansi[e4];
            }
            modifyColors(e3) {
              e3(this._colors), this._onChangeColors.fire(this.colors);
            }
            _updateRestoreColors() {
              this._restoreColors = { foreground: this._colors.foreground, background: this._colors.background, cursor: this._colors.cursor, ansi: this._colors.ansi.slice() };
            }
          };
          function p(e3, t3) {
            if (void 0 !== e3) try {
              return o2.css.toColor(e3);
            } catch (e4) {
            }
            return t3;
          }
          t2.ThemeService = v3 = s2([r11(0, c.IOptionsService)], v3);
        }, 6349: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.CircularList = void 0;
          const s2 = i9(8460), r11 = i9(844);
          class n extends r11.Disposable {
            constructor(e3) {
              super(), this._maxLength = e3, this.onDeleteEmitter = this.register(new s2.EventEmitter()), this.onDelete = this.onDeleteEmitter.event, this.onInsertEmitter = this.register(new s2.EventEmitter()), this.onInsert = this.onInsertEmitter.event, this.onTrimEmitter = this.register(new s2.EventEmitter()), this.onTrim = this.onTrimEmitter.event, this._array = new Array(this._maxLength), this._startIndex = 0, this._length = 0;
            }
            get maxLength() {
              return this._maxLength;
            }
            set maxLength(e3) {
              if (this._maxLength === e3) return;
              const t3 = new Array(e3);
              for (let i10 = 0; i10 < Math.min(e3, this.length); i10++) t3[i10] = this._array[this._getCyclicIndex(i10)];
              this._array = t3, this._maxLength = e3, this._startIndex = 0;
            }
            get length() {
              return this._length;
            }
            set length(e3) {
              if (e3 > this._length) for (let t3 = this._length; t3 < e3; t3++) this._array[t3] = void 0;
              this._length = e3;
            }
            get(e3) {
              return this._array[this._getCyclicIndex(e3)];
            }
            set(e3, t3) {
              this._array[this._getCyclicIndex(e3)] = t3;
            }
            push(e3) {
              this._array[this._getCyclicIndex(this._length)] = e3, this._length === this._maxLength ? (this._startIndex = ++this._startIndex % this._maxLength, this.onTrimEmitter.fire(1)) : this._length++;
            }
            recycle() {
              if (this._length !== this._maxLength) throw new Error("Can only recycle when the buffer is full");
              return this._startIndex = ++this._startIndex % this._maxLength, this.onTrimEmitter.fire(1), this._array[this._getCyclicIndex(this._length - 1)];
            }
            get isFull() {
              return this._length === this._maxLength;
            }
            pop() {
              return this._array[this._getCyclicIndex(this._length-- - 1)];
            }
            splice(e3, t3, ...i10) {
              if (t3) {
                for (let i11 = e3; i11 < this._length - t3; i11++) this._array[this._getCyclicIndex(i11)] = this._array[this._getCyclicIndex(i11 + t3)];
                this._length -= t3, this.onDeleteEmitter.fire({ index: e3, amount: t3 });
              }
              for (let t4 = this._length - 1; t4 >= e3; t4--) this._array[this._getCyclicIndex(t4 + i10.length)] = this._array[this._getCyclicIndex(t4)];
              for (let t4 = 0; t4 < i10.length; t4++) this._array[this._getCyclicIndex(e3 + t4)] = i10[t4];
              if (i10.length && this.onInsertEmitter.fire({ index: e3, amount: i10.length }), this._length + i10.length > this._maxLength) {
                const e4 = this._length + i10.length - this._maxLength;
                this._startIndex += e4, this._length = this._maxLength, this.onTrimEmitter.fire(e4);
              } else this._length += i10.length;
            }
            trimStart(e3) {
              e3 > this._length && (e3 = this._length), this._startIndex += e3, this._length -= e3, this.onTrimEmitter.fire(e3);
            }
            shiftElements(e3, t3, i10) {
              if (!(t3 <= 0)) {
                if (e3 < 0 || e3 >= this._length) throw new Error("start argument out of range");
                if (e3 + i10 < 0) throw new Error("Cannot shift elements in list beyond index 0");
                if (i10 > 0) {
                  for (let s4 = t3 - 1; s4 >= 0; s4--) this.set(e3 + s4 + i10, this.get(e3 + s4));
                  const s3 = e3 + t3 + i10 - this._length;
                  if (s3 > 0) for (this._length += s3; this._length > this._maxLength; ) this._length--, this._startIndex++, this.onTrimEmitter.fire(1);
                } else for (let s3 = 0; s3 < t3; s3++) this.set(e3 + s3 + i10, this.get(e3 + s3));
              }
            }
            _getCyclicIndex(e3) {
              return (this._startIndex + e3) % this._maxLength;
            }
          }
          t2.CircularList = n;
        }, 1439: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.clone = void 0, t2.clone = function e3(t3, i9 = 5) {
            if ("object" != typeof t3) return t3;
            const s2 = Array.isArray(t3) ? [] : {};
            for (const r11 in t3) s2[r11] = i9 <= 1 ? t3[r11] : t3[r11] && e3(t3[r11], i9 - 1);
            return s2;
          };
        }, 8055: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.contrastRatio = t2.toPaddedHex = t2.rgba = t2.rgb = t2.css = t2.color = t2.channels = t2.NULL_COLOR = void 0;
          const s2 = i9(6114);
          let r11 = 0, n = 0, o2 = 0, a = 0;
          var h2, c, l2, d, _4;
          function u(e3) {
            const t3 = e3.toString(16);
            return t3.length < 2 ? "0" + t3 : t3;
          }
          function f(e3, t3) {
            return e3 < t3 ? (t3 + 0.05) / (e3 + 0.05) : (e3 + 0.05) / (t3 + 0.05);
          }
          t2.NULL_COLOR = { css: "#00000000", rgba: 0 }, (function(e3) {
            e3.toCss = function(e4, t3, i10, s3) {
              return void 0 !== s3 ? `#${u(e4)}${u(t3)}${u(i10)}${u(s3)}` : `#${u(e4)}${u(t3)}${u(i10)}`;
            }, e3.toRgba = function(e4, t3, i10, s3 = 255) {
              return (e4 << 24 | t3 << 16 | i10 << 8 | s3) >>> 0;
            };
          })(h2 || (t2.channels = h2 = {})), (function(e3) {
            function t3(e4, t4) {
              return a = Math.round(255 * t4), [r11, n, o2] = _4.toChannels(e4.rgba), { css: h2.toCss(r11, n, o2, a), rgba: h2.toRgba(r11, n, o2, a) };
            }
            e3.blend = function(e4, t4) {
              if (a = (255 & t4.rgba) / 255, 1 === a) return { css: t4.css, rgba: t4.rgba };
              const i10 = t4.rgba >> 24 & 255, s3 = t4.rgba >> 16 & 255, c2 = t4.rgba >> 8 & 255, l3 = e4.rgba >> 24 & 255, d2 = e4.rgba >> 16 & 255, _5 = e4.rgba >> 8 & 255;
              return r11 = l3 + Math.round((i10 - l3) * a), n = d2 + Math.round((s3 - d2) * a), o2 = _5 + Math.round((c2 - _5) * a), { css: h2.toCss(r11, n, o2), rgba: h2.toRgba(r11, n, o2) };
            }, e3.isOpaque = function(e4) {
              return 255 == (255 & e4.rgba);
            }, e3.ensureContrastRatio = function(e4, t4, i10) {
              const s3 = _4.ensureContrastRatio(e4.rgba, t4.rgba, i10);
              if (s3) return _4.toColor(s3 >> 24 & 255, s3 >> 16 & 255, s3 >> 8 & 255);
            }, e3.opaque = function(e4) {
              const t4 = (255 | e4.rgba) >>> 0;
              return [r11, n, o2] = _4.toChannels(t4), { css: h2.toCss(r11, n, o2), rgba: t4 };
            }, e3.opacity = t3, e3.multiplyOpacity = function(e4, i10) {
              return a = 255 & e4.rgba, t3(e4, a * i10 / 255);
            }, e3.toColorRGB = function(e4) {
              return [e4.rgba >> 24 & 255, e4.rgba >> 16 & 255, e4.rgba >> 8 & 255];
            };
          })(c || (t2.color = c = {})), (function(e3) {
            let t3, i10;
            if (!s2.isNode) {
              const e4 = document.createElement("canvas");
              e4.width = 1, e4.height = 1;
              const s3 = e4.getContext("2d", { willReadFrequently: true });
              s3 && (t3 = s3, t3.globalCompositeOperation = "copy", i10 = t3.createLinearGradient(0, 0, 1, 1));
            }
            e3.toColor = function(e4) {
              if (e4.match(/#[\da-f]{3,8}/i)) switch (e4.length) {
                case 4:
                  return r11 = parseInt(e4.slice(1, 2).repeat(2), 16), n = parseInt(e4.slice(2, 3).repeat(2), 16), o2 = parseInt(e4.slice(3, 4).repeat(2), 16), _4.toColor(r11, n, o2);
                case 5:
                  return r11 = parseInt(e4.slice(1, 2).repeat(2), 16), n = parseInt(e4.slice(2, 3).repeat(2), 16), o2 = parseInt(e4.slice(3, 4).repeat(2), 16), a = parseInt(e4.slice(4, 5).repeat(2), 16), _4.toColor(r11, n, o2, a);
                case 7:
                  return { css: e4, rgba: (parseInt(e4.slice(1), 16) << 8 | 255) >>> 0 };
                case 9:
                  return { css: e4, rgba: parseInt(e4.slice(1), 16) >>> 0 };
              }
              const s3 = e4.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(,\s*(0|1|\d?\.(\d+))\s*)?\)/);
              if (s3) return r11 = parseInt(s3[1]), n = parseInt(s3[2]), o2 = parseInt(s3[3]), a = Math.round(255 * (void 0 === s3[5] ? 1 : parseFloat(s3[5]))), _4.toColor(r11, n, o2, a);
              if (!t3 || !i10) throw new Error("css.toColor: Unsupported css format");
              if (t3.fillStyle = i10, t3.fillStyle = e4, "string" != typeof t3.fillStyle) throw new Error("css.toColor: Unsupported css format");
              if (t3.fillRect(0, 0, 1, 1), [r11, n, o2, a] = t3.getImageData(0, 0, 1, 1).data, 255 !== a) throw new Error("css.toColor: Unsupported css format");
              return { rgba: h2.toRgba(r11, n, o2, a), css: e4 };
            };
          })(l2 || (t2.css = l2 = {})), (function(e3) {
            function t3(e4, t4, i10) {
              const s3 = e4 / 255, r12 = t4 / 255, n2 = i10 / 255;
              return 0.2126 * (s3 <= 0.03928 ? s3 / 12.92 : Math.pow((s3 + 0.055) / 1.055, 2.4)) + 0.7152 * (r12 <= 0.03928 ? r12 / 12.92 : Math.pow((r12 + 0.055) / 1.055, 2.4)) + 0.0722 * (n2 <= 0.03928 ? n2 / 12.92 : Math.pow((n2 + 0.055) / 1.055, 2.4));
            }
            e3.relativeLuminance = function(e4) {
              return t3(e4 >> 16 & 255, e4 >> 8 & 255, 255 & e4);
            }, e3.relativeLuminance2 = t3;
          })(d || (t2.rgb = d = {})), (function(e3) {
            function t3(e4, t4, i11) {
              const s3 = e4 >> 24 & 255, r12 = e4 >> 16 & 255, n2 = e4 >> 8 & 255;
              let o3 = t4 >> 24 & 255, a2 = t4 >> 16 & 255, h3 = t4 >> 8 & 255, c2 = f(d.relativeLuminance2(o3, a2, h3), d.relativeLuminance2(s3, r12, n2));
              for (; c2 < i11 && (o3 > 0 || a2 > 0 || h3 > 0); ) o3 -= Math.max(0, Math.ceil(0.1 * o3)), a2 -= Math.max(0, Math.ceil(0.1 * a2)), h3 -= Math.max(0, Math.ceil(0.1 * h3)), c2 = f(d.relativeLuminance2(o3, a2, h3), d.relativeLuminance2(s3, r12, n2));
              return (o3 << 24 | a2 << 16 | h3 << 8 | 255) >>> 0;
            }
            function i10(e4, t4, i11) {
              const s3 = e4 >> 24 & 255, r12 = e4 >> 16 & 255, n2 = e4 >> 8 & 255;
              let o3 = t4 >> 24 & 255, a2 = t4 >> 16 & 255, h3 = t4 >> 8 & 255, c2 = f(d.relativeLuminance2(o3, a2, h3), d.relativeLuminance2(s3, r12, n2));
              for (; c2 < i11 && (o3 < 255 || a2 < 255 || h3 < 255); ) o3 = Math.min(255, o3 + Math.ceil(0.1 * (255 - o3))), a2 = Math.min(255, a2 + Math.ceil(0.1 * (255 - a2))), h3 = Math.min(255, h3 + Math.ceil(0.1 * (255 - h3))), c2 = f(d.relativeLuminance2(o3, a2, h3), d.relativeLuminance2(s3, r12, n2));
              return (o3 << 24 | a2 << 16 | h3 << 8 | 255) >>> 0;
            }
            e3.ensureContrastRatio = function(e4, s3, r12) {
              const n2 = d.relativeLuminance(e4 >> 8), o3 = d.relativeLuminance(s3 >> 8);
              if (f(n2, o3) < r12) {
                if (o3 < n2) {
                  const o4 = t3(e4, s3, r12), a3 = f(n2, d.relativeLuminance(o4 >> 8));
                  if (a3 < r12) {
                    const t4 = i10(e4, s3, r12);
                    return a3 > f(n2, d.relativeLuminance(t4 >> 8)) ? o4 : t4;
                  }
                  return o4;
                }
                const a2 = i10(e4, s3, r12), h3 = f(n2, d.relativeLuminance(a2 >> 8));
                if (h3 < r12) {
                  const i11 = t3(e4, s3, r12);
                  return h3 > f(n2, d.relativeLuminance(i11 >> 8)) ? a2 : i11;
                }
                return a2;
              }
            }, e3.reduceLuminance = t3, e3.increaseLuminance = i10, e3.toChannels = function(e4) {
              return [e4 >> 24 & 255, e4 >> 16 & 255, e4 >> 8 & 255, 255 & e4];
            }, e3.toColor = function(e4, t4, i11, s3) {
              return { css: h2.toCss(e4, t4, i11, s3), rgba: h2.toRgba(e4, t4, i11, s3) };
            };
          })(_4 || (t2.rgba = _4 = {})), t2.toPaddedHex = u, t2.contrastRatio = f;
        }, 8969: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.CoreTerminal = void 0;
          const s2 = i9(844), r11 = i9(2585), n = i9(4348), o2 = i9(7866), a = i9(744), h2 = i9(7302), c = i9(6975), l2 = i9(8460), d = i9(1753), _4 = i9(1480), u = i9(7994), f = i9(9282), v3 = i9(5435), p = i9(5981), g2 = i9(2660);
          let m = false;
          class S2 extends s2.Disposable {
            get onScroll() {
              return this._onScrollApi || (this._onScrollApi = this.register(new l2.EventEmitter()), this._onScroll.event(((e3) => {
                var t3;
                null === (t3 = this._onScrollApi) || void 0 === t3 || t3.fire(e3.position);
              }))), this._onScrollApi.event;
            }
            get cols() {
              return this._bufferService.cols;
            }
            get rows() {
              return this._bufferService.rows;
            }
            get buffers() {
              return this._bufferService.buffers;
            }
            get options() {
              return this.optionsService.options;
            }
            set options(e3) {
              for (const t3 in e3) this.optionsService.options[t3] = e3[t3];
            }
            constructor(e3) {
              super(), this._windowsWrappingHeuristics = this.register(new s2.MutableDisposable()), this._onBinary = this.register(new l2.EventEmitter()), this.onBinary = this._onBinary.event, this._onData = this.register(new l2.EventEmitter()), this.onData = this._onData.event, this._onLineFeed = this.register(new l2.EventEmitter()), this.onLineFeed = this._onLineFeed.event, this._onResize = this.register(new l2.EventEmitter()), this.onResize = this._onResize.event, this._onWriteParsed = this.register(new l2.EventEmitter()), this.onWriteParsed = this._onWriteParsed.event, this._onScroll = this.register(new l2.EventEmitter()), this._instantiationService = new n.InstantiationService(), this.optionsService = this.register(new h2.OptionsService(e3)), this._instantiationService.setService(r11.IOptionsService, this.optionsService), this._bufferService = this.register(this._instantiationService.createInstance(a.BufferService)), this._instantiationService.setService(r11.IBufferService, this._bufferService), this._logService = this.register(this._instantiationService.createInstance(o2.LogService)), this._instantiationService.setService(r11.ILogService, this._logService), this.coreService = this.register(this._instantiationService.createInstance(c.CoreService)), this._instantiationService.setService(r11.ICoreService, this.coreService), this.coreMouseService = this.register(this._instantiationService.createInstance(d.CoreMouseService)), this._instantiationService.setService(r11.ICoreMouseService, this.coreMouseService), this.unicodeService = this.register(this._instantiationService.createInstance(_4.UnicodeService)), this._instantiationService.setService(r11.IUnicodeService, this.unicodeService), this._charsetService = this._instantiationService.createInstance(u.CharsetService), this._instantiationService.setService(r11.ICharsetService, this._charsetService), this._oscLinkService = this._instantiationService.createInstance(g2.OscLinkService), this._instantiationService.setService(r11.IOscLinkService, this._oscLinkService), this._inputHandler = this.register(new v3.InputHandler(this._bufferService, this._charsetService, this.coreService, this._logService, this.optionsService, this._oscLinkService, this.coreMouseService, this.unicodeService)), this.register((0, l2.forwardEvent)(this._inputHandler.onLineFeed, this._onLineFeed)), this.register(this._inputHandler), this.register((0, l2.forwardEvent)(this._bufferService.onResize, this._onResize)), this.register((0, l2.forwardEvent)(this.coreService.onData, this._onData)), this.register((0, l2.forwardEvent)(this.coreService.onBinary, this._onBinary)), this.register(this.coreService.onRequestScrollToBottom((() => this.scrollToBottom()))), this.register(this.coreService.onUserInput((() => this._writeBuffer.handleUserInput()))), this.register(this.optionsService.onMultipleOptionChange(["windowsMode", "windowsPty"], (() => this._handleWindowsPtyOptionChange()))), this.register(this._bufferService.onScroll(((e4) => {
                this._onScroll.fire({ position: this._bufferService.buffer.ydisp, source: 0 }), this._inputHandler.markRangeDirty(this._bufferService.buffer.scrollTop, this._bufferService.buffer.scrollBottom);
              }))), this.register(this._inputHandler.onScroll(((e4) => {
                this._onScroll.fire({ position: this._bufferService.buffer.ydisp, source: 0 }), this._inputHandler.markRangeDirty(this._bufferService.buffer.scrollTop, this._bufferService.buffer.scrollBottom);
              }))), this._writeBuffer = this.register(new p.WriteBuffer(((e4, t3) => this._inputHandler.parse(e4, t3)))), this.register((0, l2.forwardEvent)(this._writeBuffer.onWriteParsed, this._onWriteParsed));
            }
            write(e3, t3) {
              this._writeBuffer.write(e3, t3);
            }
            writeSync(e3, t3) {
              this._logService.logLevel <= r11.LogLevelEnum.WARN && !m && (this._logService.warn("writeSync is unreliable and will be removed soon."), m = true), this._writeBuffer.writeSync(e3, t3);
            }
            resize(e3, t3) {
              isNaN(e3) || isNaN(t3) || (e3 = Math.max(e3, a.MINIMUM_COLS), t3 = Math.max(t3, a.MINIMUM_ROWS), this._bufferService.resize(e3, t3));
            }
            scroll(e3, t3 = false) {
              this._bufferService.scroll(e3, t3);
            }
            scrollLines(e3, t3, i10) {
              this._bufferService.scrollLines(e3, t3, i10);
            }
            scrollPages(e3) {
              this.scrollLines(e3 * (this.rows - 1));
            }
            scrollToTop() {
              this.scrollLines(-this._bufferService.buffer.ydisp);
            }
            scrollToBottom() {
              this.scrollLines(this._bufferService.buffer.ybase - this._bufferService.buffer.ydisp);
            }
            scrollToLine(e3) {
              const t3 = e3 - this._bufferService.buffer.ydisp;
              0 !== t3 && this.scrollLines(t3);
            }
            registerEscHandler(e3, t3) {
              return this._inputHandler.registerEscHandler(e3, t3);
            }
            registerDcsHandler(e3, t3) {
              return this._inputHandler.registerDcsHandler(e3, t3);
            }
            registerCsiHandler(e3, t3) {
              return this._inputHandler.registerCsiHandler(e3, t3);
            }
            registerOscHandler(e3, t3) {
              return this._inputHandler.registerOscHandler(e3, t3);
            }
            _setup() {
              this._handleWindowsPtyOptionChange();
            }
            reset() {
              this._inputHandler.reset(), this._bufferService.reset(), this._charsetService.reset(), this.coreService.reset(), this.coreMouseService.reset();
            }
            _handleWindowsPtyOptionChange() {
              let e3 = false;
              const t3 = this.optionsService.rawOptions.windowsPty;
              t3 && void 0 !== t3.buildNumber && void 0 !== t3.buildNumber ? e3 = !!("conpty" === t3.backend && t3.buildNumber < 21376) : this.optionsService.rawOptions.windowsMode && (e3 = true), e3 ? this._enableWindowsWrappingHeuristics() : this._windowsWrappingHeuristics.clear();
            }
            _enableWindowsWrappingHeuristics() {
              if (!this._windowsWrappingHeuristics.value) {
                const e3 = [];
                e3.push(this.onLineFeed(f.updateWindowsModeWrappedState.bind(null, this._bufferService))), e3.push(this.registerCsiHandler({ final: "H" }, (() => ((0, f.updateWindowsModeWrappedState)(this._bufferService), false)))), this._windowsWrappingHeuristics.value = (0, s2.toDisposable)((() => {
                  for (const t3 of e3) t3.dispose();
                }));
              }
            }
          }
          t2.CoreTerminal = S2;
        }, 8460: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.forwardEvent = t2.EventEmitter = void 0, t2.EventEmitter = class {
            constructor() {
              this._listeners = [], this._disposed = false;
            }
            get event() {
              return this._event || (this._event = (e3) => (this._listeners.push(e3), { dispose: () => {
                if (!this._disposed) {
                  for (let t3 = 0; t3 < this._listeners.length; t3++) if (this._listeners[t3] === e3) return void this._listeners.splice(t3, 1);
                }
              } })), this._event;
            }
            fire(e3, t3) {
              const i9 = [];
              for (let e4 = 0; e4 < this._listeners.length; e4++) i9.push(this._listeners[e4]);
              for (let s2 = 0; s2 < i9.length; s2++) i9[s2].call(void 0, e3, t3);
            }
            dispose() {
              this.clearListeners(), this._disposed = true;
            }
            clearListeners() {
              this._listeners && (this._listeners.length = 0);
            }
          }, t2.forwardEvent = function(e3, t3) {
            return e3(((e4) => t3.fire(e4)));
          };
        }, 5435: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.InputHandler = t2.WindowsOptionsReportType = void 0;
          const n = i9(2584), o2 = i9(7116), a = i9(2015), h2 = i9(844), c = i9(482), l2 = i9(8437), d = i9(8460), _4 = i9(643), u = i9(511), f = i9(3734), v3 = i9(2585), p = i9(6242), g2 = i9(6351), m = i9(5941), S2 = { "(": 0, ")": 1, "*": 2, "+": 3, "-": 1, ".": 2 }, C4 = 131072;
          function b(e3, t3) {
            if (e3 > 24) return t3.setWinLines || false;
            switch (e3) {
              case 1:
                return !!t3.restoreWin;
              case 2:
                return !!t3.minimizeWin;
              case 3:
                return !!t3.setWinPosition;
              case 4:
                return !!t3.setWinSizePixels;
              case 5:
                return !!t3.raiseWin;
              case 6:
                return !!t3.lowerWin;
              case 7:
                return !!t3.refreshWin;
              case 8:
                return !!t3.setWinSizeChars;
              case 9:
                return !!t3.maximizeWin;
              case 10:
                return !!t3.fullscreenWin;
              case 11:
                return !!t3.getWinState;
              case 13:
                return !!t3.getWinPosition;
              case 14:
                return !!t3.getWinSizePixels;
              case 15:
                return !!t3.getScreenSizePixels;
              case 16:
                return !!t3.getCellSizePixels;
              case 18:
                return !!t3.getWinSizeChars;
              case 19:
                return !!t3.getScreenSizeChars;
              case 20:
                return !!t3.getIconTitle;
              case 21:
                return !!t3.getWinTitle;
              case 22:
                return !!t3.pushTitle;
              case 23:
                return !!t3.popTitle;
              case 24:
                return !!t3.setWinLines;
            }
            return false;
          }
          var y;
          !(function(e3) {
            e3[e3.GET_WIN_SIZE_PIXELS = 0] = "GET_WIN_SIZE_PIXELS", e3[e3.GET_CELL_SIZE_PIXELS = 1] = "GET_CELL_SIZE_PIXELS";
          })(y || (t2.WindowsOptionsReportType = y = {}));
          let w4 = 0;
          class E extends h2.Disposable {
            getAttrData() {
              return this._curAttrData;
            }
            constructor(e3, t3, i10, s3, r12, h3, _5, f2, v4 = new a.EscapeSequenceParser()) {
              super(), this._bufferService = e3, this._charsetService = t3, this._coreService = i10, this._logService = s3, this._optionsService = r12, this._oscLinkService = h3, this._coreMouseService = _5, this._unicodeService = f2, this._parser = v4, this._parseBuffer = new Uint32Array(4096), this._stringDecoder = new c.StringToUtf32(), this._utf8Decoder = new c.Utf8ToUtf32(), this._workCell = new u.CellData(), this._windowTitle = "", this._iconName = "", this._windowTitleStack = [], this._iconNameStack = [], this._curAttrData = l2.DEFAULT_ATTR_DATA.clone(), this._eraseAttrDataInternal = l2.DEFAULT_ATTR_DATA.clone(), this._onRequestBell = this.register(new d.EventEmitter()), this.onRequestBell = this._onRequestBell.event, this._onRequestRefreshRows = this.register(new d.EventEmitter()), this.onRequestRefreshRows = this._onRequestRefreshRows.event, this._onRequestReset = this.register(new d.EventEmitter()), this.onRequestReset = this._onRequestReset.event, this._onRequestSendFocus = this.register(new d.EventEmitter()), this.onRequestSendFocus = this._onRequestSendFocus.event, this._onRequestSyncScrollBar = this.register(new d.EventEmitter()), this.onRequestSyncScrollBar = this._onRequestSyncScrollBar.event, this._onRequestWindowsOptionsReport = this.register(new d.EventEmitter()), this.onRequestWindowsOptionsReport = this._onRequestWindowsOptionsReport.event, this._onA11yChar = this.register(new d.EventEmitter()), this.onA11yChar = this._onA11yChar.event, this._onA11yTab = this.register(new d.EventEmitter()), this.onA11yTab = this._onA11yTab.event, this._onCursorMove = this.register(new d.EventEmitter()), this.onCursorMove = this._onCursorMove.event, this._onLineFeed = this.register(new d.EventEmitter()), this.onLineFeed = this._onLineFeed.event, this._onScroll = this.register(new d.EventEmitter()), this.onScroll = this._onScroll.event, this._onTitleChange = this.register(new d.EventEmitter()), this.onTitleChange = this._onTitleChange.event, this._onColor = this.register(new d.EventEmitter()), this.onColor = this._onColor.event, this._parseStack = { paused: false, cursorStartX: 0, cursorStartY: 0, decodedLength: 0, position: 0 }, this._specialColors = [256, 257, 258], this.register(this._parser), this._dirtyRowTracker = new k4(this._bufferService), this._activeBuffer = this._bufferService.buffer, this.register(this._bufferService.buffers.onBufferActivate(((e4) => this._activeBuffer = e4.activeBuffer))), this._parser.setCsiHandlerFallback(((e4, t4) => {
                this._logService.debug("Unknown CSI code: ", { identifier: this._parser.identToString(e4), params: t4.toArray() });
              })), this._parser.setEscHandlerFallback(((e4) => {
                this._logService.debug("Unknown ESC code: ", { identifier: this._parser.identToString(e4) });
              })), this._parser.setExecuteHandlerFallback(((e4) => {
                this._logService.debug("Unknown EXECUTE code: ", { code: e4 });
              })), this._parser.setOscHandlerFallback(((e4, t4, i11) => {
                this._logService.debug("Unknown OSC code: ", { identifier: e4, action: t4, data: i11 });
              })), this._parser.setDcsHandlerFallback(((e4, t4, i11) => {
                "HOOK" === t4 && (i11 = i11.toArray()), this._logService.debug("Unknown DCS code: ", { identifier: this._parser.identToString(e4), action: t4, payload: i11 });
              })), this._parser.setPrintHandler(((e4, t4, i11) => this.print(e4, t4, i11))), this._parser.registerCsiHandler({ final: "@" }, ((e4) => this.insertChars(e4))), this._parser.registerCsiHandler({ intermediates: " ", final: "@" }, ((e4) => this.scrollLeft(e4))), this._parser.registerCsiHandler({ final: "A" }, ((e4) => this.cursorUp(e4))), this._parser.registerCsiHandler({ intermediates: " ", final: "A" }, ((e4) => this.scrollRight(e4))), this._parser.registerCsiHandler({ final: "B" }, ((e4) => this.cursorDown(e4))), this._parser.registerCsiHandler({ final: "C" }, ((e4) => this.cursorForward(e4))), this._parser.registerCsiHandler({ final: "D" }, ((e4) => this.cursorBackward(e4))), this._parser.registerCsiHandler({ final: "E" }, ((e4) => this.cursorNextLine(e4))), this._parser.registerCsiHandler({ final: "F" }, ((e4) => this.cursorPrecedingLine(e4))), this._parser.registerCsiHandler({ final: "G" }, ((e4) => this.cursorCharAbsolute(e4))), this._parser.registerCsiHandler({ final: "H" }, ((e4) => this.cursorPosition(e4))), this._parser.registerCsiHandler({ final: "I" }, ((e4) => this.cursorForwardTab(e4))), this._parser.registerCsiHandler({ final: "J" }, ((e4) => this.eraseInDisplay(e4, false))), this._parser.registerCsiHandler({ prefix: "?", final: "J" }, ((e4) => this.eraseInDisplay(e4, true))), this._parser.registerCsiHandler({ final: "K" }, ((e4) => this.eraseInLine(e4, false))), this._parser.registerCsiHandler({ prefix: "?", final: "K" }, ((e4) => this.eraseInLine(e4, true))), this._parser.registerCsiHandler({ final: "L" }, ((e4) => this.insertLines(e4))), this._parser.registerCsiHandler({ final: "M" }, ((e4) => this.deleteLines(e4))), this._parser.registerCsiHandler({ final: "P" }, ((e4) => this.deleteChars(e4))), this._parser.registerCsiHandler({ final: "S" }, ((e4) => this.scrollUp(e4))), this._parser.registerCsiHandler({ final: "T" }, ((e4) => this.scrollDown(e4))), this._parser.registerCsiHandler({ final: "X" }, ((e4) => this.eraseChars(e4))), this._parser.registerCsiHandler({ final: "Z" }, ((e4) => this.cursorBackwardTab(e4))), this._parser.registerCsiHandler({ final: "`" }, ((e4) => this.charPosAbsolute(e4))), this._parser.registerCsiHandler({ final: "a" }, ((e4) => this.hPositionRelative(e4))), this._parser.registerCsiHandler({ final: "b" }, ((e4) => this.repeatPrecedingCharacter(e4))), this._parser.registerCsiHandler({ final: "c" }, ((e4) => this.sendDeviceAttributesPrimary(e4))), this._parser.registerCsiHandler({ prefix: ">", final: "c" }, ((e4) => this.sendDeviceAttributesSecondary(e4))), this._parser.registerCsiHandler({ final: "d" }, ((e4) => this.linePosAbsolute(e4))), this._parser.registerCsiHandler({ final: "e" }, ((e4) => this.vPositionRelative(e4))), this._parser.registerCsiHandler({ final: "f" }, ((e4) => this.hVPosition(e4))), this._parser.registerCsiHandler({ final: "g" }, ((e4) => this.tabClear(e4))), this._parser.registerCsiHandler({ final: "h" }, ((e4) => this.setMode(e4))), this._parser.registerCsiHandler({ prefix: "?", final: "h" }, ((e4) => this.setModePrivate(e4))), this._parser.registerCsiHandler({ final: "l" }, ((e4) => this.resetMode(e4))), this._parser.registerCsiHandler({ prefix: "?", final: "l" }, ((e4) => this.resetModePrivate(e4))), this._parser.registerCsiHandler({ final: "m" }, ((e4) => this.charAttributes(e4))), this._parser.registerCsiHandler({ final: "n" }, ((e4) => this.deviceStatus(e4))), this._parser.registerCsiHandler({ prefix: "?", final: "n" }, ((e4) => this.deviceStatusPrivate(e4))), this._parser.registerCsiHandler({ intermediates: "!", final: "p" }, ((e4) => this.softReset(e4))), this._parser.registerCsiHandler({ intermediates: " ", final: "q" }, ((e4) => this.setCursorStyle(e4))), this._parser.registerCsiHandler({ final: "r" }, ((e4) => this.setScrollRegion(e4))), this._parser.registerCsiHandler({ final: "s" }, ((e4) => this.saveCursor(e4))), this._parser.registerCsiHandler({ final: "t" }, ((e4) => this.windowOptions(e4))), this._parser.registerCsiHandler({ final: "u" }, ((e4) => this.restoreCursor(e4))), this._parser.registerCsiHandler({ intermediates: "'", final: "}" }, ((e4) => this.insertColumns(e4))), this._parser.registerCsiHandler({ intermediates: "'", final: "~" }, ((e4) => this.deleteColumns(e4))), this._parser.registerCsiHandler({ intermediates: '"', final: "q" }, ((e4) => this.selectProtected(e4))), this._parser.registerCsiHandler({ intermediates: "$", final: "p" }, ((e4) => this.requestMode(e4, true))), this._parser.registerCsiHandler({ prefix: "?", intermediates: "$", final: "p" }, ((e4) => this.requestMode(e4, false))), this._parser.setExecuteHandler(n.C0.BEL, (() => this.bell())), this._parser.setExecuteHandler(n.C0.LF, (() => this.lineFeed())), this._parser.setExecuteHandler(n.C0.VT, (() => this.lineFeed())), this._parser.setExecuteHandler(n.C0.FF, (() => this.lineFeed())), this._parser.setExecuteHandler(n.C0.CR, (() => this.carriageReturn())), this._parser.setExecuteHandler(n.C0.BS, (() => this.backspace())), this._parser.setExecuteHandler(n.C0.HT, (() => this.tab())), this._parser.setExecuteHandler(n.C0.SO, (() => this.shiftOut())), this._parser.setExecuteHandler(n.C0.SI, (() => this.shiftIn())), this._parser.setExecuteHandler(n.C1.IND, (() => this.index())), this._parser.setExecuteHandler(n.C1.NEL, (() => this.nextLine())), this._parser.setExecuteHandler(n.C1.HTS, (() => this.tabSet())), this._parser.registerOscHandler(0, new p.OscHandler(((e4) => (this.setTitle(e4), this.setIconName(e4), true)))), this._parser.registerOscHandler(1, new p.OscHandler(((e4) => this.setIconName(e4)))), this._parser.registerOscHandler(2, new p.OscHandler(((e4) => this.setTitle(e4)))), this._parser.registerOscHandler(4, new p.OscHandler(((e4) => this.setOrReportIndexedColor(e4)))), this._parser.registerOscHandler(8, new p.OscHandler(((e4) => this.setHyperlink(e4)))), this._parser.registerOscHandler(10, new p.OscHandler(((e4) => this.setOrReportFgColor(e4)))), this._parser.registerOscHandler(11, new p.OscHandler(((e4) => this.setOrReportBgColor(e4)))), this._parser.registerOscHandler(12, new p.OscHandler(((e4) => this.setOrReportCursorColor(e4)))), this._parser.registerOscHandler(104, new p.OscHandler(((e4) => this.restoreIndexedColor(e4)))), this._parser.registerOscHandler(110, new p.OscHandler(((e4) => this.restoreFgColor(e4)))), this._parser.registerOscHandler(111, new p.OscHandler(((e4) => this.restoreBgColor(e4)))), this._parser.registerOscHandler(112, new p.OscHandler(((e4) => this.restoreCursorColor(e4)))), this._parser.registerEscHandler({ final: "7" }, (() => this.saveCursor())), this._parser.registerEscHandler({ final: "8" }, (() => this.restoreCursor())), this._parser.registerEscHandler({ final: "D" }, (() => this.index())), this._parser.registerEscHandler({ final: "E" }, (() => this.nextLine())), this._parser.registerEscHandler({ final: "H" }, (() => this.tabSet())), this._parser.registerEscHandler({ final: "M" }, (() => this.reverseIndex())), this._parser.registerEscHandler({ final: "=" }, (() => this.keypadApplicationMode())), this._parser.registerEscHandler({ final: ">" }, (() => this.keypadNumericMode())), this._parser.registerEscHandler({ final: "c" }, (() => this.fullReset())), this._parser.registerEscHandler({ final: "n" }, (() => this.setgLevel(2))), this._parser.registerEscHandler({ final: "o" }, (() => this.setgLevel(3))), this._parser.registerEscHandler({ final: "|" }, (() => this.setgLevel(3))), this._parser.registerEscHandler({ final: "}" }, (() => this.setgLevel(2))), this._parser.registerEscHandler({ final: "~" }, (() => this.setgLevel(1))), this._parser.registerEscHandler({ intermediates: "%", final: "@" }, (() => this.selectDefaultCharset())), this._parser.registerEscHandler({ intermediates: "%", final: "G" }, (() => this.selectDefaultCharset()));
              for (const e4 in o2.CHARSETS) this._parser.registerEscHandler({ intermediates: "(", final: e4 }, (() => this.selectCharset("(" + e4))), this._parser.registerEscHandler({ intermediates: ")", final: e4 }, (() => this.selectCharset(")" + e4))), this._parser.registerEscHandler({ intermediates: "*", final: e4 }, (() => this.selectCharset("*" + e4))), this._parser.registerEscHandler({ intermediates: "+", final: e4 }, (() => this.selectCharset("+" + e4))), this._parser.registerEscHandler({ intermediates: "-", final: e4 }, (() => this.selectCharset("-" + e4))), this._parser.registerEscHandler({ intermediates: ".", final: e4 }, (() => this.selectCharset("." + e4))), this._parser.registerEscHandler({ intermediates: "/", final: e4 }, (() => this.selectCharset("/" + e4)));
              this._parser.registerEscHandler({ intermediates: "#", final: "8" }, (() => this.screenAlignmentPattern())), this._parser.setErrorHandler(((e4) => (this._logService.error("Parsing error: ", e4), e4))), this._parser.registerDcsHandler({ intermediates: "$", final: "q" }, new g2.DcsHandler(((e4, t4) => this.requestStatusString(e4, t4))));
            }
            _preserveStack(e3, t3, i10, s3) {
              this._parseStack.paused = true, this._parseStack.cursorStartX = e3, this._parseStack.cursorStartY = t3, this._parseStack.decodedLength = i10, this._parseStack.position = s3;
            }
            _logSlowResolvingAsync(e3) {
              this._logService.logLevel <= v3.LogLevelEnum.WARN && Promise.race([e3, new Promise(((e4, t3) => setTimeout((() => t3("#SLOW_TIMEOUT")), 5e3)))]).catch(((e4) => {
                if ("#SLOW_TIMEOUT" !== e4) throw e4;
                console.warn("async parser handler taking longer than 5000 ms");
              }));
            }
            _getCurrentLinkId() {
              return this._curAttrData.extended.urlId;
            }
            parse(e3, t3) {
              let i10, s3 = this._activeBuffer.x, r12 = this._activeBuffer.y, n2 = 0;
              const o3 = this._parseStack.paused;
              if (o3) {
                if (i10 = this._parser.parse(this._parseBuffer, this._parseStack.decodedLength, t3)) return this._logSlowResolvingAsync(i10), i10;
                s3 = this._parseStack.cursorStartX, r12 = this._parseStack.cursorStartY, this._parseStack.paused = false, e3.length > C4 && (n2 = this._parseStack.position + C4);
              }
              if (this._logService.logLevel <= v3.LogLevelEnum.DEBUG && this._logService.debug("parsing data" + ("string" == typeof e3 ? ` "${e3}"` : ` "${Array.prototype.map.call(e3, ((e4) => String.fromCharCode(e4))).join("")}"`), "string" == typeof e3 ? e3.split("").map(((e4) => e4.charCodeAt(0))) : e3), this._parseBuffer.length < e3.length && this._parseBuffer.length < C4 && (this._parseBuffer = new Uint32Array(Math.min(e3.length, C4))), o3 || this._dirtyRowTracker.clearRange(), e3.length > C4) for (let t4 = n2; t4 < e3.length; t4 += C4) {
                const n3 = t4 + C4 < e3.length ? t4 + C4 : e3.length, o4 = "string" == typeof e3 ? this._stringDecoder.decode(e3.substring(t4, n3), this._parseBuffer) : this._utf8Decoder.decode(e3.subarray(t4, n3), this._parseBuffer);
                if (i10 = this._parser.parse(this._parseBuffer, o4)) return this._preserveStack(s3, r12, o4, t4), this._logSlowResolvingAsync(i10), i10;
              }
              else if (!o3) {
                const t4 = "string" == typeof e3 ? this._stringDecoder.decode(e3, this._parseBuffer) : this._utf8Decoder.decode(e3, this._parseBuffer);
                if (i10 = this._parser.parse(this._parseBuffer, t4)) return this._preserveStack(s3, r12, t4, 0), this._logSlowResolvingAsync(i10), i10;
              }
              this._activeBuffer.x === s3 && this._activeBuffer.y === r12 || this._onCursorMove.fire(), this._onRequestRefreshRows.fire(this._dirtyRowTracker.start, this._dirtyRowTracker.end);
            }
            print(e3, t3, i10) {
              let s3, r12;
              const n2 = this._charsetService.charset, o3 = this._optionsService.rawOptions.screenReaderMode, a2 = this._bufferService.cols, h3 = this._coreService.decPrivateModes.wraparound, l3 = this._coreService.modes.insertMode, d2 = this._curAttrData;
              let u2 = this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y);
              this._dirtyRowTracker.markDirty(this._activeBuffer.y), this._activeBuffer.x && i10 - t3 > 0 && 2 === u2.getWidth(this._activeBuffer.x - 1) && u2.setCellFromCodePoint(this._activeBuffer.x - 1, 0, 1, d2.fg, d2.bg, d2.extended);
              for (let f2 = t3; f2 < i10; ++f2) {
                if (s3 = e3[f2], r12 = this._unicodeService.wcwidth(s3), s3 < 127 && n2) {
                  const e4 = n2[String.fromCharCode(s3)];
                  e4 && (s3 = e4.charCodeAt(0));
                }
                if (o3 && this._onA11yChar.fire((0, c.stringFromCodePoint)(s3)), this._getCurrentLinkId() && this._oscLinkService.addLineToLink(this._getCurrentLinkId(), this._activeBuffer.ybase + this._activeBuffer.y), r12 || !this._activeBuffer.x) {
                  if (this._activeBuffer.x + r12 - 1 >= a2) {
                    if (h3) {
                      for (; this._activeBuffer.x < a2; ) u2.setCellFromCodePoint(this._activeBuffer.x++, 0, 1, d2.fg, d2.bg, d2.extended);
                      this._activeBuffer.x = 0, this._activeBuffer.y++, this._activeBuffer.y === this._activeBuffer.scrollBottom + 1 ? (this._activeBuffer.y--, this._bufferService.scroll(this._eraseAttrData(), true)) : (this._activeBuffer.y >= this._bufferService.rows && (this._activeBuffer.y = this._bufferService.rows - 1), this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y).isWrapped = true), u2 = this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y);
                    } else if (this._activeBuffer.x = a2 - 1, 2 === r12) continue;
                  }
                  if (l3 && (u2.insertCells(this._activeBuffer.x, r12, this._activeBuffer.getNullCell(d2), d2), 2 === u2.getWidth(a2 - 1) && u2.setCellFromCodePoint(a2 - 1, _4.NULL_CELL_CODE, _4.NULL_CELL_WIDTH, d2.fg, d2.bg, d2.extended)), u2.setCellFromCodePoint(this._activeBuffer.x++, s3, r12, d2.fg, d2.bg, d2.extended), r12 > 0) for (; --r12; ) u2.setCellFromCodePoint(this._activeBuffer.x++, 0, 0, d2.fg, d2.bg, d2.extended);
                } else u2.getWidth(this._activeBuffer.x - 1) ? u2.addCodepointToCell(this._activeBuffer.x - 1, s3) : u2.addCodepointToCell(this._activeBuffer.x - 2, s3);
              }
              i10 - t3 > 0 && (u2.loadCell(this._activeBuffer.x - 1, this._workCell), 2 === this._workCell.getWidth() || this._workCell.getCode() > 65535 ? this._parser.precedingCodepoint = 0 : this._workCell.isCombined() ? this._parser.precedingCodepoint = this._workCell.getChars().charCodeAt(0) : this._parser.precedingCodepoint = this._workCell.content), this._activeBuffer.x < a2 && i10 - t3 > 0 && 0 === u2.getWidth(this._activeBuffer.x) && !u2.hasContent(this._activeBuffer.x) && u2.setCellFromCodePoint(this._activeBuffer.x, 0, 1, d2.fg, d2.bg, d2.extended), this._dirtyRowTracker.markDirty(this._activeBuffer.y);
            }
            registerCsiHandler(e3, t3) {
              return "t" !== e3.final || e3.prefix || e3.intermediates ? this._parser.registerCsiHandler(e3, t3) : this._parser.registerCsiHandler(e3, ((e4) => !b(e4.params[0], this._optionsService.rawOptions.windowOptions) || t3(e4)));
            }
            registerDcsHandler(e3, t3) {
              return this._parser.registerDcsHandler(e3, new g2.DcsHandler(t3));
            }
            registerEscHandler(e3, t3) {
              return this._parser.registerEscHandler(e3, t3);
            }
            registerOscHandler(e3, t3) {
              return this._parser.registerOscHandler(e3, new p.OscHandler(t3));
            }
            bell() {
              return this._onRequestBell.fire(), true;
            }
            lineFeed() {
              return this._dirtyRowTracker.markDirty(this._activeBuffer.y), this._optionsService.rawOptions.convertEol && (this._activeBuffer.x = 0), this._activeBuffer.y++, this._activeBuffer.y === this._activeBuffer.scrollBottom + 1 ? (this._activeBuffer.y--, this._bufferService.scroll(this._eraseAttrData())) : this._activeBuffer.y >= this._bufferService.rows ? this._activeBuffer.y = this._bufferService.rows - 1 : this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y).isWrapped = false, this._activeBuffer.x >= this._bufferService.cols && this._activeBuffer.x--, this._dirtyRowTracker.markDirty(this._activeBuffer.y), this._onLineFeed.fire(), true;
            }
            carriageReturn() {
              return this._activeBuffer.x = 0, true;
            }
            backspace() {
              var e3;
              if (!this._coreService.decPrivateModes.reverseWraparound) return this._restrictCursor(), this._activeBuffer.x > 0 && this._activeBuffer.x--, true;
              if (this._restrictCursor(this._bufferService.cols), this._activeBuffer.x > 0) this._activeBuffer.x--;
              else if (0 === this._activeBuffer.x && this._activeBuffer.y > this._activeBuffer.scrollTop && this._activeBuffer.y <= this._activeBuffer.scrollBottom && (null === (e3 = this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y)) || void 0 === e3 ? void 0 : e3.isWrapped)) {
                this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y).isWrapped = false, this._activeBuffer.y--, this._activeBuffer.x = this._bufferService.cols - 1;
                const e4 = this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y);
                e4.hasWidth(this._activeBuffer.x) && !e4.hasContent(this._activeBuffer.x) && this._activeBuffer.x--;
              }
              return this._restrictCursor(), true;
            }
            tab() {
              if (this._activeBuffer.x >= this._bufferService.cols) return true;
              const e3 = this._activeBuffer.x;
              return this._activeBuffer.x = this._activeBuffer.nextStop(), this._optionsService.rawOptions.screenReaderMode && this._onA11yTab.fire(this._activeBuffer.x - e3), true;
            }
            shiftOut() {
              return this._charsetService.setgLevel(1), true;
            }
            shiftIn() {
              return this._charsetService.setgLevel(0), true;
            }
            _restrictCursor(e3 = this._bufferService.cols - 1) {
              this._activeBuffer.x = Math.min(e3, Math.max(0, this._activeBuffer.x)), this._activeBuffer.y = this._coreService.decPrivateModes.origin ? Math.min(this._activeBuffer.scrollBottom, Math.max(this._activeBuffer.scrollTop, this._activeBuffer.y)) : Math.min(this._bufferService.rows - 1, Math.max(0, this._activeBuffer.y)), this._dirtyRowTracker.markDirty(this._activeBuffer.y);
            }
            _setCursor(e3, t3) {
              this._dirtyRowTracker.markDirty(this._activeBuffer.y), this._coreService.decPrivateModes.origin ? (this._activeBuffer.x = e3, this._activeBuffer.y = this._activeBuffer.scrollTop + t3) : (this._activeBuffer.x = e3, this._activeBuffer.y = t3), this._restrictCursor(), this._dirtyRowTracker.markDirty(this._activeBuffer.y);
            }
            _moveCursor(e3, t3) {
              this._restrictCursor(), this._setCursor(this._activeBuffer.x + e3, this._activeBuffer.y + t3);
            }
            cursorUp(e3) {
              const t3 = this._activeBuffer.y - this._activeBuffer.scrollTop;
              return t3 >= 0 ? this._moveCursor(0, -Math.min(t3, e3.params[0] || 1)) : this._moveCursor(0, -(e3.params[0] || 1)), true;
            }
            cursorDown(e3) {
              const t3 = this._activeBuffer.scrollBottom - this._activeBuffer.y;
              return t3 >= 0 ? this._moveCursor(0, Math.min(t3, e3.params[0] || 1)) : this._moveCursor(0, e3.params[0] || 1), true;
            }
            cursorForward(e3) {
              return this._moveCursor(e3.params[0] || 1, 0), true;
            }
            cursorBackward(e3) {
              return this._moveCursor(-(e3.params[0] || 1), 0), true;
            }
            cursorNextLine(e3) {
              return this.cursorDown(e3), this._activeBuffer.x = 0, true;
            }
            cursorPrecedingLine(e3) {
              return this.cursorUp(e3), this._activeBuffer.x = 0, true;
            }
            cursorCharAbsolute(e3) {
              return this._setCursor((e3.params[0] || 1) - 1, this._activeBuffer.y), true;
            }
            cursorPosition(e3) {
              return this._setCursor(e3.length >= 2 ? (e3.params[1] || 1) - 1 : 0, (e3.params[0] || 1) - 1), true;
            }
            charPosAbsolute(e3) {
              return this._setCursor((e3.params[0] || 1) - 1, this._activeBuffer.y), true;
            }
            hPositionRelative(e3) {
              return this._moveCursor(e3.params[0] || 1, 0), true;
            }
            linePosAbsolute(e3) {
              return this._setCursor(this._activeBuffer.x, (e3.params[0] || 1) - 1), true;
            }
            vPositionRelative(e3) {
              return this._moveCursor(0, e3.params[0] || 1), true;
            }
            hVPosition(e3) {
              return this.cursorPosition(e3), true;
            }
            tabClear(e3) {
              const t3 = e3.params[0];
              return 0 === t3 ? delete this._activeBuffer.tabs[this._activeBuffer.x] : 3 === t3 && (this._activeBuffer.tabs = {}), true;
            }
            cursorForwardTab(e3) {
              if (this._activeBuffer.x >= this._bufferService.cols) return true;
              let t3 = e3.params[0] || 1;
              for (; t3--; ) this._activeBuffer.x = this._activeBuffer.nextStop();
              return true;
            }
            cursorBackwardTab(e3) {
              if (this._activeBuffer.x >= this._bufferService.cols) return true;
              let t3 = e3.params[0] || 1;
              for (; t3--; ) this._activeBuffer.x = this._activeBuffer.prevStop();
              return true;
            }
            selectProtected(e3) {
              const t3 = e3.params[0];
              return 1 === t3 && (this._curAttrData.bg |= 536870912), 2 !== t3 && 0 !== t3 || (this._curAttrData.bg &= -536870913), true;
            }
            _eraseInBufferLine(e3, t3, i10, s3 = false, r12 = false) {
              const n2 = this._activeBuffer.lines.get(this._activeBuffer.ybase + e3);
              n2.replaceCells(t3, i10, this._activeBuffer.getNullCell(this._eraseAttrData()), this._eraseAttrData(), r12), s3 && (n2.isWrapped = false);
            }
            _resetBufferLine(e3, t3 = false) {
              const i10 = this._activeBuffer.lines.get(this._activeBuffer.ybase + e3);
              i10 && (i10.fill(this._activeBuffer.getNullCell(this._eraseAttrData()), t3), this._bufferService.buffer.clearMarkers(this._activeBuffer.ybase + e3), i10.isWrapped = false);
            }
            eraseInDisplay(e3, t3 = false) {
              let i10;
              switch (this._restrictCursor(this._bufferService.cols), e3.params[0]) {
                case 0:
                  for (i10 = this._activeBuffer.y, this._dirtyRowTracker.markDirty(i10), this._eraseInBufferLine(i10++, this._activeBuffer.x, this._bufferService.cols, 0 === this._activeBuffer.x, t3); i10 < this._bufferService.rows; i10++) this._resetBufferLine(i10, t3);
                  this._dirtyRowTracker.markDirty(i10);
                  break;
                case 1:
                  for (i10 = this._activeBuffer.y, this._dirtyRowTracker.markDirty(i10), this._eraseInBufferLine(i10, 0, this._activeBuffer.x + 1, true, t3), this._activeBuffer.x + 1 >= this._bufferService.cols && (this._activeBuffer.lines.get(i10 + 1).isWrapped = false); i10--; ) this._resetBufferLine(i10, t3);
                  this._dirtyRowTracker.markDirty(0);
                  break;
                case 2:
                  for (i10 = this._bufferService.rows, this._dirtyRowTracker.markDirty(i10 - 1); i10--; ) this._resetBufferLine(i10, t3);
                  this._dirtyRowTracker.markDirty(0);
                  break;
                case 3:
                  const e4 = this._activeBuffer.lines.length - this._bufferService.rows;
                  e4 > 0 && (this._activeBuffer.lines.trimStart(e4), this._activeBuffer.ybase = Math.max(this._activeBuffer.ybase - e4, 0), this._activeBuffer.ydisp = Math.max(this._activeBuffer.ydisp - e4, 0), this._onScroll.fire(0));
              }
              return true;
            }
            eraseInLine(e3, t3 = false) {
              switch (this._restrictCursor(this._bufferService.cols), e3.params[0]) {
                case 0:
                  this._eraseInBufferLine(this._activeBuffer.y, this._activeBuffer.x, this._bufferService.cols, 0 === this._activeBuffer.x, t3);
                  break;
                case 1:
                  this._eraseInBufferLine(this._activeBuffer.y, 0, this._activeBuffer.x + 1, false, t3);
                  break;
                case 2:
                  this._eraseInBufferLine(this._activeBuffer.y, 0, this._bufferService.cols, true, t3);
              }
              return this._dirtyRowTracker.markDirty(this._activeBuffer.y), true;
            }
            insertLines(e3) {
              this._restrictCursor();
              let t3 = e3.params[0] || 1;
              if (this._activeBuffer.y > this._activeBuffer.scrollBottom || this._activeBuffer.y < this._activeBuffer.scrollTop) return true;
              const i10 = this._activeBuffer.ybase + this._activeBuffer.y, s3 = this._bufferService.rows - 1 - this._activeBuffer.scrollBottom, r12 = this._bufferService.rows - 1 + this._activeBuffer.ybase - s3 + 1;
              for (; t3--; ) this._activeBuffer.lines.splice(r12 - 1, 1), this._activeBuffer.lines.splice(i10, 0, this._activeBuffer.getBlankLine(this._eraseAttrData()));
              return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.y, this._activeBuffer.scrollBottom), this._activeBuffer.x = 0, true;
            }
            deleteLines(e3) {
              this._restrictCursor();
              let t3 = e3.params[0] || 1;
              if (this._activeBuffer.y > this._activeBuffer.scrollBottom || this._activeBuffer.y < this._activeBuffer.scrollTop) return true;
              const i10 = this._activeBuffer.ybase + this._activeBuffer.y;
              let s3;
              for (s3 = this._bufferService.rows - 1 - this._activeBuffer.scrollBottom, s3 = this._bufferService.rows - 1 + this._activeBuffer.ybase - s3; t3--; ) this._activeBuffer.lines.splice(i10, 1), this._activeBuffer.lines.splice(s3, 0, this._activeBuffer.getBlankLine(this._eraseAttrData()));
              return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.y, this._activeBuffer.scrollBottom), this._activeBuffer.x = 0, true;
            }
            insertChars(e3) {
              this._restrictCursor();
              const t3 = this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y);
              return t3 && (t3.insertCells(this._activeBuffer.x, e3.params[0] || 1, this._activeBuffer.getNullCell(this._eraseAttrData()), this._eraseAttrData()), this._dirtyRowTracker.markDirty(this._activeBuffer.y)), true;
            }
            deleteChars(e3) {
              this._restrictCursor();
              const t3 = this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y);
              return t3 && (t3.deleteCells(this._activeBuffer.x, e3.params[0] || 1, this._activeBuffer.getNullCell(this._eraseAttrData()), this._eraseAttrData()), this._dirtyRowTracker.markDirty(this._activeBuffer.y)), true;
            }
            scrollUp(e3) {
              let t3 = e3.params[0] || 1;
              for (; t3--; ) this._activeBuffer.lines.splice(this._activeBuffer.ybase + this._activeBuffer.scrollTop, 1), this._activeBuffer.lines.splice(this._activeBuffer.ybase + this._activeBuffer.scrollBottom, 0, this._activeBuffer.getBlankLine(this._eraseAttrData()));
              return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop, this._activeBuffer.scrollBottom), true;
            }
            scrollDown(e3) {
              let t3 = e3.params[0] || 1;
              for (; t3--; ) this._activeBuffer.lines.splice(this._activeBuffer.ybase + this._activeBuffer.scrollBottom, 1), this._activeBuffer.lines.splice(this._activeBuffer.ybase + this._activeBuffer.scrollTop, 0, this._activeBuffer.getBlankLine(l2.DEFAULT_ATTR_DATA));
              return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop, this._activeBuffer.scrollBottom), true;
            }
            scrollLeft(e3) {
              if (this._activeBuffer.y > this._activeBuffer.scrollBottom || this._activeBuffer.y < this._activeBuffer.scrollTop) return true;
              const t3 = e3.params[0] || 1;
              for (let e4 = this._activeBuffer.scrollTop; e4 <= this._activeBuffer.scrollBottom; ++e4) {
                const i10 = this._activeBuffer.lines.get(this._activeBuffer.ybase + e4);
                i10.deleteCells(0, t3, this._activeBuffer.getNullCell(this._eraseAttrData()), this._eraseAttrData()), i10.isWrapped = false;
              }
              return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop, this._activeBuffer.scrollBottom), true;
            }
            scrollRight(e3) {
              if (this._activeBuffer.y > this._activeBuffer.scrollBottom || this._activeBuffer.y < this._activeBuffer.scrollTop) return true;
              const t3 = e3.params[0] || 1;
              for (let e4 = this._activeBuffer.scrollTop; e4 <= this._activeBuffer.scrollBottom; ++e4) {
                const i10 = this._activeBuffer.lines.get(this._activeBuffer.ybase + e4);
                i10.insertCells(0, t3, this._activeBuffer.getNullCell(this._eraseAttrData()), this._eraseAttrData()), i10.isWrapped = false;
              }
              return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop, this._activeBuffer.scrollBottom), true;
            }
            insertColumns(e3) {
              if (this._activeBuffer.y > this._activeBuffer.scrollBottom || this._activeBuffer.y < this._activeBuffer.scrollTop) return true;
              const t3 = e3.params[0] || 1;
              for (let e4 = this._activeBuffer.scrollTop; e4 <= this._activeBuffer.scrollBottom; ++e4) {
                const i10 = this._activeBuffer.lines.get(this._activeBuffer.ybase + e4);
                i10.insertCells(this._activeBuffer.x, t3, this._activeBuffer.getNullCell(this._eraseAttrData()), this._eraseAttrData()), i10.isWrapped = false;
              }
              return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop, this._activeBuffer.scrollBottom), true;
            }
            deleteColumns(e3) {
              if (this._activeBuffer.y > this._activeBuffer.scrollBottom || this._activeBuffer.y < this._activeBuffer.scrollTop) return true;
              const t3 = e3.params[0] || 1;
              for (let e4 = this._activeBuffer.scrollTop; e4 <= this._activeBuffer.scrollBottom; ++e4) {
                const i10 = this._activeBuffer.lines.get(this._activeBuffer.ybase + e4);
                i10.deleteCells(this._activeBuffer.x, t3, this._activeBuffer.getNullCell(this._eraseAttrData()), this._eraseAttrData()), i10.isWrapped = false;
              }
              return this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop, this._activeBuffer.scrollBottom), true;
            }
            eraseChars(e3) {
              this._restrictCursor();
              const t3 = this._activeBuffer.lines.get(this._activeBuffer.ybase + this._activeBuffer.y);
              return t3 && (t3.replaceCells(this._activeBuffer.x, this._activeBuffer.x + (e3.params[0] || 1), this._activeBuffer.getNullCell(this._eraseAttrData()), this._eraseAttrData()), this._dirtyRowTracker.markDirty(this._activeBuffer.y)), true;
            }
            repeatPrecedingCharacter(e3) {
              if (!this._parser.precedingCodepoint) return true;
              const t3 = e3.params[0] || 1, i10 = new Uint32Array(t3);
              for (let e4 = 0; e4 < t3; ++e4) i10[e4] = this._parser.precedingCodepoint;
              return this.print(i10, 0, i10.length), true;
            }
            sendDeviceAttributesPrimary(e3) {
              return e3.params[0] > 0 || (this._is("xterm") || this._is("rxvt-unicode") || this._is("screen") ? this._coreService.triggerDataEvent(n.C0.ESC + "[?1;2c") : this._is("linux") && this._coreService.triggerDataEvent(n.C0.ESC + "[?6c")), true;
            }
            sendDeviceAttributesSecondary(e3) {
              return e3.params[0] > 0 || (this._is("xterm") ? this._coreService.triggerDataEvent(n.C0.ESC + "[>0;276;0c") : this._is("rxvt-unicode") ? this._coreService.triggerDataEvent(n.C0.ESC + "[>85;95;0c") : this._is("linux") ? this._coreService.triggerDataEvent(e3.params[0] + "c") : this._is("screen") && this._coreService.triggerDataEvent(n.C0.ESC + "[>83;40003;0c")), true;
            }
            _is(e3) {
              return 0 === (this._optionsService.rawOptions.termName + "").indexOf(e3);
            }
            setMode(e3) {
              for (let t3 = 0; t3 < e3.length; t3++) switch (e3.params[t3]) {
                case 4:
                  this._coreService.modes.insertMode = true;
                  break;
                case 20:
                  this._optionsService.options.convertEol = true;
              }
              return true;
            }
            setModePrivate(e3) {
              for (let t3 = 0; t3 < e3.length; t3++) switch (e3.params[t3]) {
                case 1:
                  this._coreService.decPrivateModes.applicationCursorKeys = true;
                  break;
                case 2:
                  this._charsetService.setgCharset(0, o2.DEFAULT_CHARSET), this._charsetService.setgCharset(1, o2.DEFAULT_CHARSET), this._charsetService.setgCharset(2, o2.DEFAULT_CHARSET), this._charsetService.setgCharset(3, o2.DEFAULT_CHARSET);
                  break;
                case 3:
                  this._optionsService.rawOptions.windowOptions.setWinLines && (this._bufferService.resize(132, this._bufferService.rows), this._onRequestReset.fire());
                  break;
                case 6:
                  this._coreService.decPrivateModes.origin = true, this._setCursor(0, 0);
                  break;
                case 7:
                  this._coreService.decPrivateModes.wraparound = true;
                  break;
                case 12:
                  this._optionsService.options.cursorBlink = true;
                  break;
                case 45:
                  this._coreService.decPrivateModes.reverseWraparound = true;
                  break;
                case 66:
                  this._logService.debug("Serial port requested application keypad."), this._coreService.decPrivateModes.applicationKeypad = true, this._onRequestSyncScrollBar.fire();
                  break;
                case 9:
                  this._coreMouseService.activeProtocol = "X10";
                  break;
                case 1e3:
                  this._coreMouseService.activeProtocol = "VT200";
                  break;
                case 1002:
                  this._coreMouseService.activeProtocol = "DRAG";
                  break;
                case 1003:
                  this._coreMouseService.activeProtocol = "ANY";
                  break;
                case 1004:
                  this._coreService.decPrivateModes.sendFocus = true, this._onRequestSendFocus.fire();
                  break;
                case 1005:
                  this._logService.debug("DECSET 1005 not supported (see #2507)");
                  break;
                case 1006:
                  this._coreMouseService.activeEncoding = "SGR";
                  break;
                case 1015:
                  this._logService.debug("DECSET 1015 not supported (see #2507)");
                  break;
                case 1016:
                  this._coreMouseService.activeEncoding = "SGR_PIXELS";
                  break;
                case 25:
                  this._coreService.isCursorHidden = false;
                  break;
                case 1048:
                  this.saveCursor();
                  break;
                case 1049:
                  this.saveCursor();
                case 47:
                case 1047:
                  this._bufferService.buffers.activateAltBuffer(this._eraseAttrData()), this._coreService.isCursorInitialized = true, this._onRequestRefreshRows.fire(0, this._bufferService.rows - 1), this._onRequestSyncScrollBar.fire();
                  break;
                case 2004:
                  this._coreService.decPrivateModes.bracketedPasteMode = true;
              }
              return true;
            }
            resetMode(e3) {
              for (let t3 = 0; t3 < e3.length; t3++) switch (e3.params[t3]) {
                case 4:
                  this._coreService.modes.insertMode = false;
                  break;
                case 20:
                  this._optionsService.options.convertEol = false;
              }
              return true;
            }
            resetModePrivate(e3) {
              for (let t3 = 0; t3 < e3.length; t3++) switch (e3.params[t3]) {
                case 1:
                  this._coreService.decPrivateModes.applicationCursorKeys = false;
                  break;
                case 3:
                  this._optionsService.rawOptions.windowOptions.setWinLines && (this._bufferService.resize(80, this._bufferService.rows), this._onRequestReset.fire());
                  break;
                case 6:
                  this._coreService.decPrivateModes.origin = false, this._setCursor(0, 0);
                  break;
                case 7:
                  this._coreService.decPrivateModes.wraparound = false;
                  break;
                case 12:
                  this._optionsService.options.cursorBlink = false;
                  break;
                case 45:
                  this._coreService.decPrivateModes.reverseWraparound = false;
                  break;
                case 66:
                  this._logService.debug("Switching back to normal keypad."), this._coreService.decPrivateModes.applicationKeypad = false, this._onRequestSyncScrollBar.fire();
                  break;
                case 9:
                case 1e3:
                case 1002:
                case 1003:
                  this._coreMouseService.activeProtocol = "NONE";
                  break;
                case 1004:
                  this._coreService.decPrivateModes.sendFocus = false;
                  break;
                case 1005:
                  this._logService.debug("DECRST 1005 not supported (see #2507)");
                  break;
                case 1006:
                case 1016:
                  this._coreMouseService.activeEncoding = "DEFAULT";
                  break;
                case 1015:
                  this._logService.debug("DECRST 1015 not supported (see #2507)");
                  break;
                case 25:
                  this._coreService.isCursorHidden = true;
                  break;
                case 1048:
                  this.restoreCursor();
                  break;
                case 1049:
                case 47:
                case 1047:
                  this._bufferService.buffers.activateNormalBuffer(), 1049 === e3.params[t3] && this.restoreCursor(), this._coreService.isCursorInitialized = true, this._onRequestRefreshRows.fire(0, this._bufferService.rows - 1), this._onRequestSyncScrollBar.fire();
                  break;
                case 2004:
                  this._coreService.decPrivateModes.bracketedPasteMode = false;
              }
              return true;
            }
            requestMode(e3, t3) {
              const i10 = this._coreService.decPrivateModes, { activeProtocol: s3, activeEncoding: r12 } = this._coreMouseService, o3 = this._coreService, { buffers: a2, cols: h3 } = this._bufferService, { active: c2, alt: l3 } = a2, d2 = this._optionsService.rawOptions, _5 = (e4) => e4 ? 1 : 2, u2 = e3.params[0];
              return f2 = u2, v4 = t3 ? 2 === u2 ? 4 : 4 === u2 ? _5(o3.modes.insertMode) : 12 === u2 ? 3 : 20 === u2 ? _5(d2.convertEol) : 0 : 1 === u2 ? _5(i10.applicationCursorKeys) : 3 === u2 ? d2.windowOptions.setWinLines ? 80 === h3 ? 2 : 132 === h3 ? 1 : 0 : 0 : 6 === u2 ? _5(i10.origin) : 7 === u2 ? _5(i10.wraparound) : 8 === u2 ? 3 : 9 === u2 ? _5("X10" === s3) : 12 === u2 ? _5(d2.cursorBlink) : 25 === u2 ? _5(!o3.isCursorHidden) : 45 === u2 ? _5(i10.reverseWraparound) : 66 === u2 ? _5(i10.applicationKeypad) : 67 === u2 ? 4 : 1e3 === u2 ? _5("VT200" === s3) : 1002 === u2 ? _5("DRAG" === s3) : 1003 === u2 ? _5("ANY" === s3) : 1004 === u2 ? _5(i10.sendFocus) : 1005 === u2 ? 4 : 1006 === u2 ? _5("SGR" === r12) : 1015 === u2 ? 4 : 1016 === u2 ? _5("SGR_PIXELS" === r12) : 1048 === u2 ? 1 : 47 === u2 || 1047 === u2 || 1049 === u2 ? _5(c2 === l3) : 2004 === u2 ? _5(i10.bracketedPasteMode) : 0, o3.triggerDataEvent(`${n.C0.ESC}[${t3 ? "" : "?"}${f2};${v4}$y`), true;
              var f2, v4;
            }
            _updateAttrColor(e3, t3, i10, s3, r12) {
              return 2 === t3 ? (e3 |= 50331648, e3 &= -16777216, e3 |= f.AttributeData.fromColorRGB([i10, s3, r12])) : 5 === t3 && (e3 &= -50331904, e3 |= 33554432 | 255 & i10), e3;
            }
            _extractColor(e3, t3, i10) {
              const s3 = [0, 0, -1, 0, 0, 0];
              let r12 = 0, n2 = 0;
              do {
                if (s3[n2 + r12] = e3.params[t3 + n2], e3.hasSubParams(t3 + n2)) {
                  const i11 = e3.getSubParams(t3 + n2);
                  let o3 = 0;
                  do {
                    5 === s3[1] && (r12 = 1), s3[n2 + o3 + 1 + r12] = i11[o3];
                  } while (++o3 < i11.length && o3 + n2 + 1 + r12 < s3.length);
                  break;
                }
                if (5 === s3[1] && n2 + r12 >= 2 || 2 === s3[1] && n2 + r12 >= 5) break;
                s3[1] && (r12 = 1);
              } while (++n2 + t3 < e3.length && n2 + r12 < s3.length);
              for (let e4 = 2; e4 < s3.length; ++e4) -1 === s3[e4] && (s3[e4] = 0);
              switch (s3[0]) {
                case 38:
                  i10.fg = this._updateAttrColor(i10.fg, s3[1], s3[3], s3[4], s3[5]);
                  break;
                case 48:
                  i10.bg = this._updateAttrColor(i10.bg, s3[1], s3[3], s3[4], s3[5]);
                  break;
                case 58:
                  i10.extended = i10.extended.clone(), i10.extended.underlineColor = this._updateAttrColor(i10.extended.underlineColor, s3[1], s3[3], s3[4], s3[5]);
              }
              return n2;
            }
            _processUnderline(e3, t3) {
              t3.extended = t3.extended.clone(), (!~e3 || e3 > 5) && (e3 = 1), t3.extended.underlineStyle = e3, t3.fg |= 268435456, 0 === e3 && (t3.fg &= -268435457), t3.updateExtended();
            }
            _processSGR0(e3) {
              e3.fg = l2.DEFAULT_ATTR_DATA.fg, e3.bg = l2.DEFAULT_ATTR_DATA.bg, e3.extended = e3.extended.clone(), e3.extended.underlineStyle = 0, e3.extended.underlineColor &= -67108864, e3.updateExtended();
            }
            charAttributes(e3) {
              if (1 === e3.length && 0 === e3.params[0]) return this._processSGR0(this._curAttrData), true;
              const t3 = e3.length;
              let i10;
              const s3 = this._curAttrData;
              for (let r12 = 0; r12 < t3; r12++) i10 = e3.params[r12], i10 >= 30 && i10 <= 37 ? (s3.fg &= -50331904, s3.fg |= 16777216 | i10 - 30) : i10 >= 40 && i10 <= 47 ? (s3.bg &= -50331904, s3.bg |= 16777216 | i10 - 40) : i10 >= 90 && i10 <= 97 ? (s3.fg &= -50331904, s3.fg |= 16777224 | i10 - 90) : i10 >= 100 && i10 <= 107 ? (s3.bg &= -50331904, s3.bg |= 16777224 | i10 - 100) : 0 === i10 ? this._processSGR0(s3) : 1 === i10 ? s3.fg |= 134217728 : 3 === i10 ? s3.bg |= 67108864 : 4 === i10 ? (s3.fg |= 268435456, this._processUnderline(e3.hasSubParams(r12) ? e3.getSubParams(r12)[0] : 1, s3)) : 5 === i10 ? s3.fg |= 536870912 : 7 === i10 ? s3.fg |= 67108864 : 8 === i10 ? s3.fg |= 1073741824 : 9 === i10 ? s3.fg |= 2147483648 : 2 === i10 ? s3.bg |= 134217728 : 21 === i10 ? this._processUnderline(2, s3) : 22 === i10 ? (s3.fg &= -134217729, s3.bg &= -134217729) : 23 === i10 ? s3.bg &= -67108865 : 24 === i10 ? (s3.fg &= -268435457, this._processUnderline(0, s3)) : 25 === i10 ? s3.fg &= -536870913 : 27 === i10 ? s3.fg &= -67108865 : 28 === i10 ? s3.fg &= -1073741825 : 29 === i10 ? s3.fg &= 2147483647 : 39 === i10 ? (s3.fg &= -67108864, s3.fg |= 16777215 & l2.DEFAULT_ATTR_DATA.fg) : 49 === i10 ? (s3.bg &= -67108864, s3.bg |= 16777215 & l2.DEFAULT_ATTR_DATA.bg) : 38 === i10 || 48 === i10 || 58 === i10 ? r12 += this._extractColor(e3, r12, s3) : 53 === i10 ? s3.bg |= 1073741824 : 55 === i10 ? s3.bg &= -1073741825 : 59 === i10 ? (s3.extended = s3.extended.clone(), s3.extended.underlineColor = -1, s3.updateExtended()) : 100 === i10 ? (s3.fg &= -67108864, s3.fg |= 16777215 & l2.DEFAULT_ATTR_DATA.fg, s3.bg &= -67108864, s3.bg |= 16777215 & l2.DEFAULT_ATTR_DATA.bg) : this._logService.debug("Unknown SGR attribute: %d.", i10);
              return true;
            }
            deviceStatus(e3) {
              switch (e3.params[0]) {
                case 5:
                  this._coreService.triggerDataEvent(`${n.C0.ESC}[0n`);
                  break;
                case 6:
                  const e4 = this._activeBuffer.y + 1, t3 = this._activeBuffer.x + 1;
                  this._coreService.triggerDataEvent(`${n.C0.ESC}[${e4};${t3}R`);
              }
              return true;
            }
            deviceStatusPrivate(e3) {
              if (6 === e3.params[0]) {
                const e4 = this._activeBuffer.y + 1, t3 = this._activeBuffer.x + 1;
                this._coreService.triggerDataEvent(`${n.C0.ESC}[?${e4};${t3}R`);
              }
              return true;
            }
            softReset(e3) {
              return this._coreService.isCursorHidden = false, this._onRequestSyncScrollBar.fire(), this._activeBuffer.scrollTop = 0, this._activeBuffer.scrollBottom = this._bufferService.rows - 1, this._curAttrData = l2.DEFAULT_ATTR_DATA.clone(), this._coreService.reset(), this._charsetService.reset(), this._activeBuffer.savedX = 0, this._activeBuffer.savedY = this._activeBuffer.ybase, this._activeBuffer.savedCurAttrData.fg = this._curAttrData.fg, this._activeBuffer.savedCurAttrData.bg = this._curAttrData.bg, this._activeBuffer.savedCharset = this._charsetService.charset, this._coreService.decPrivateModes.origin = false, true;
            }
            setCursorStyle(e3) {
              const t3 = e3.params[0] || 1;
              switch (t3) {
                case 1:
                case 2:
                  this._optionsService.options.cursorStyle = "block";
                  break;
                case 3:
                case 4:
                  this._optionsService.options.cursorStyle = "underline";
                  break;
                case 5:
                case 6:
                  this._optionsService.options.cursorStyle = "bar";
              }
              const i10 = t3 % 2 == 1;
              return this._optionsService.options.cursorBlink = i10, true;
            }
            setScrollRegion(e3) {
              const t3 = e3.params[0] || 1;
              let i10;
              return (e3.length < 2 || (i10 = e3.params[1]) > this._bufferService.rows || 0 === i10) && (i10 = this._bufferService.rows), i10 > t3 && (this._activeBuffer.scrollTop = t3 - 1, this._activeBuffer.scrollBottom = i10 - 1, this._setCursor(0, 0)), true;
            }
            windowOptions(e3) {
              if (!b(e3.params[0], this._optionsService.rawOptions.windowOptions)) return true;
              const t3 = e3.length > 1 ? e3.params[1] : 0;
              switch (e3.params[0]) {
                case 14:
                  2 !== t3 && this._onRequestWindowsOptionsReport.fire(y.GET_WIN_SIZE_PIXELS);
                  break;
                case 16:
                  this._onRequestWindowsOptionsReport.fire(y.GET_CELL_SIZE_PIXELS);
                  break;
                case 18:
                  this._bufferService && this._coreService.triggerDataEvent(`${n.C0.ESC}[8;${this._bufferService.rows};${this._bufferService.cols}t`);
                  break;
                case 22:
                  0 !== t3 && 2 !== t3 || (this._windowTitleStack.push(this._windowTitle), this._windowTitleStack.length > 10 && this._windowTitleStack.shift()), 0 !== t3 && 1 !== t3 || (this._iconNameStack.push(this._iconName), this._iconNameStack.length > 10 && this._iconNameStack.shift());
                  break;
                case 23:
                  0 !== t3 && 2 !== t3 || this._windowTitleStack.length && this.setTitle(this._windowTitleStack.pop()), 0 !== t3 && 1 !== t3 || this._iconNameStack.length && this.setIconName(this._iconNameStack.pop());
              }
              return true;
            }
            saveCursor(e3) {
              return this._activeBuffer.savedX = this._activeBuffer.x, this._activeBuffer.savedY = this._activeBuffer.ybase + this._activeBuffer.y, this._activeBuffer.savedCurAttrData.fg = this._curAttrData.fg, this._activeBuffer.savedCurAttrData.bg = this._curAttrData.bg, this._activeBuffer.savedCharset = this._charsetService.charset, true;
            }
            restoreCursor(e3) {
              return this._activeBuffer.x = this._activeBuffer.savedX || 0, this._activeBuffer.y = Math.max(this._activeBuffer.savedY - this._activeBuffer.ybase, 0), this._curAttrData.fg = this._activeBuffer.savedCurAttrData.fg, this._curAttrData.bg = this._activeBuffer.savedCurAttrData.bg, this._charsetService.charset = this._savedCharset, this._activeBuffer.savedCharset && (this._charsetService.charset = this._activeBuffer.savedCharset), this._restrictCursor(), true;
            }
            setTitle(e3) {
              return this._windowTitle = e3, this._onTitleChange.fire(e3), true;
            }
            setIconName(e3) {
              return this._iconName = e3, true;
            }
            setOrReportIndexedColor(e3) {
              const t3 = [], i10 = e3.split(";");
              for (; i10.length > 1; ) {
                const e4 = i10.shift(), s3 = i10.shift();
                if (/^\d+$/.exec(e4)) {
                  const i11 = parseInt(e4);
                  if (L2(i11)) if ("?" === s3) t3.push({ type: 0, index: i11 });
                  else {
                    const e5 = (0, m.parseColor)(s3);
                    e5 && t3.push({ type: 1, index: i11, color: e5 });
                  }
                }
              }
              return t3.length && this._onColor.fire(t3), true;
            }
            setHyperlink(e3) {
              const t3 = e3.split(";");
              return !(t3.length < 2) && (t3[1] ? this._createHyperlink(t3[0], t3[1]) : !t3[0] && this._finishHyperlink());
            }
            _createHyperlink(e3, t3) {
              this._getCurrentLinkId() && this._finishHyperlink();
              const i10 = e3.split(":");
              let s3;
              const r12 = i10.findIndex(((e4) => e4.startsWith("id=")));
              return -1 !== r12 && (s3 = i10[r12].slice(3) || void 0), this._curAttrData.extended = this._curAttrData.extended.clone(), this._curAttrData.extended.urlId = this._oscLinkService.registerLink({ id: s3, uri: t3 }), this._curAttrData.updateExtended(), true;
            }
            _finishHyperlink() {
              return this._curAttrData.extended = this._curAttrData.extended.clone(), this._curAttrData.extended.urlId = 0, this._curAttrData.updateExtended(), true;
            }
            _setOrReportSpecialColor(e3, t3) {
              const i10 = e3.split(";");
              for (let e4 = 0; e4 < i10.length && !(t3 >= this._specialColors.length); ++e4, ++t3) if ("?" === i10[e4]) this._onColor.fire([{ type: 0, index: this._specialColors[t3] }]);
              else {
                const s3 = (0, m.parseColor)(i10[e4]);
                s3 && this._onColor.fire([{ type: 1, index: this._specialColors[t3], color: s3 }]);
              }
              return true;
            }
            setOrReportFgColor(e3) {
              return this._setOrReportSpecialColor(e3, 0);
            }
            setOrReportBgColor(e3) {
              return this._setOrReportSpecialColor(e3, 1);
            }
            setOrReportCursorColor(e3) {
              return this._setOrReportSpecialColor(e3, 2);
            }
            restoreIndexedColor(e3) {
              if (!e3) return this._onColor.fire([{ type: 2 }]), true;
              const t3 = [], i10 = e3.split(";");
              for (let e4 = 0; e4 < i10.length; ++e4) if (/^\d+$/.exec(i10[e4])) {
                const s3 = parseInt(i10[e4]);
                L2(s3) && t3.push({ type: 2, index: s3 });
              }
              return t3.length && this._onColor.fire(t3), true;
            }
            restoreFgColor(e3) {
              return this._onColor.fire([{ type: 2, index: 256 }]), true;
            }
            restoreBgColor(e3) {
              return this._onColor.fire([{ type: 2, index: 257 }]), true;
            }
            restoreCursorColor(e3) {
              return this._onColor.fire([{ type: 2, index: 258 }]), true;
            }
            nextLine() {
              return this._activeBuffer.x = 0, this.index(), true;
            }
            keypadApplicationMode() {
              return this._logService.debug("Serial port requested application keypad."), this._coreService.decPrivateModes.applicationKeypad = true, this._onRequestSyncScrollBar.fire(), true;
            }
            keypadNumericMode() {
              return this._logService.debug("Switching back to normal keypad."), this._coreService.decPrivateModes.applicationKeypad = false, this._onRequestSyncScrollBar.fire(), true;
            }
            selectDefaultCharset() {
              return this._charsetService.setgLevel(0), this._charsetService.setgCharset(0, o2.DEFAULT_CHARSET), true;
            }
            selectCharset(e3) {
              return 2 !== e3.length ? (this.selectDefaultCharset(), true) : ("/" === e3[0] || this._charsetService.setgCharset(S2[e3[0]], o2.CHARSETS[e3[1]] || o2.DEFAULT_CHARSET), true);
            }
            index() {
              return this._restrictCursor(), this._activeBuffer.y++, this._activeBuffer.y === this._activeBuffer.scrollBottom + 1 ? (this._activeBuffer.y--, this._bufferService.scroll(this._eraseAttrData())) : this._activeBuffer.y >= this._bufferService.rows && (this._activeBuffer.y = this._bufferService.rows - 1), this._restrictCursor(), true;
            }
            tabSet() {
              return this._activeBuffer.tabs[this._activeBuffer.x] = true, true;
            }
            reverseIndex() {
              if (this._restrictCursor(), this._activeBuffer.y === this._activeBuffer.scrollTop) {
                const e3 = this._activeBuffer.scrollBottom - this._activeBuffer.scrollTop;
                this._activeBuffer.lines.shiftElements(this._activeBuffer.ybase + this._activeBuffer.y, e3, 1), this._activeBuffer.lines.set(this._activeBuffer.ybase + this._activeBuffer.y, this._activeBuffer.getBlankLine(this._eraseAttrData())), this._dirtyRowTracker.markRangeDirty(this._activeBuffer.scrollTop, this._activeBuffer.scrollBottom);
              } else this._activeBuffer.y--, this._restrictCursor();
              return true;
            }
            fullReset() {
              return this._parser.reset(), this._onRequestReset.fire(), true;
            }
            reset() {
              this._curAttrData = l2.DEFAULT_ATTR_DATA.clone(), this._eraseAttrDataInternal = l2.DEFAULT_ATTR_DATA.clone();
            }
            _eraseAttrData() {
              return this._eraseAttrDataInternal.bg &= -67108864, this._eraseAttrDataInternal.bg |= 67108863 & this._curAttrData.bg, this._eraseAttrDataInternal;
            }
            setgLevel(e3) {
              return this._charsetService.setgLevel(e3), true;
            }
            screenAlignmentPattern() {
              const e3 = new u.CellData();
              e3.content = 1 << 22 | "E".charCodeAt(0), e3.fg = this._curAttrData.fg, e3.bg = this._curAttrData.bg, this._setCursor(0, 0);
              for (let t3 = 0; t3 < this._bufferService.rows; ++t3) {
                const i10 = this._activeBuffer.ybase + this._activeBuffer.y + t3, s3 = this._activeBuffer.lines.get(i10);
                s3 && (s3.fill(e3), s3.isWrapped = false);
              }
              return this._dirtyRowTracker.markAllDirty(), this._setCursor(0, 0), true;
            }
            requestStatusString(e3, t3) {
              const i10 = this._bufferService.buffer, s3 = this._optionsService.rawOptions;
              return ((e4) => (this._coreService.triggerDataEvent(`${n.C0.ESC}${e4}${n.C0.ESC}\\`), true))('"q' === e3 ? `P1$r${this._curAttrData.isProtected() ? 1 : 0}"q` : '"p' === e3 ? 'P1$r61;1"p' : "r" === e3 ? `P1$r${i10.scrollTop + 1};${i10.scrollBottom + 1}r` : "m" === e3 ? "P1$r0m" : " q" === e3 ? `P1$r${{ block: 2, underline: 4, bar: 6 }[s3.cursorStyle] - (s3.cursorBlink ? 1 : 0)} q` : "P0$r");
            }
            markRangeDirty(e3, t3) {
              this._dirtyRowTracker.markRangeDirty(e3, t3);
            }
          }
          t2.InputHandler = E;
          let k4 = class {
            constructor(e3) {
              this._bufferService = e3, this.clearRange();
            }
            clearRange() {
              this.start = this._bufferService.buffer.y, this.end = this._bufferService.buffer.y;
            }
            markDirty(e3) {
              e3 < this.start ? this.start = e3 : e3 > this.end && (this.end = e3);
            }
            markRangeDirty(e3, t3) {
              e3 > t3 && (w4 = e3, e3 = t3, t3 = w4), e3 < this.start && (this.start = e3), t3 > this.end && (this.end = t3);
            }
            markAllDirty() {
              this.markRangeDirty(0, this._bufferService.rows - 1);
            }
          };
          function L2(e3) {
            return 0 <= e3 && e3 < 256;
          }
          k4 = s2([r11(0, v3.IBufferService)], k4);
        }, 844: (e2, t2) => {
          function i9(e3) {
            for (const t3 of e3) t3.dispose();
            e3.length = 0;
          }
          Object.defineProperty(t2, "__esModule", { value: true }), t2.getDisposeArrayDisposable = t2.disposeArray = t2.toDisposable = t2.MutableDisposable = t2.Disposable = void 0, t2.Disposable = class {
            constructor() {
              this._disposables = [], this._isDisposed = false;
            }
            dispose() {
              this._isDisposed = true;
              for (const e3 of this._disposables) e3.dispose();
              this._disposables.length = 0;
            }
            register(e3) {
              return this._disposables.push(e3), e3;
            }
            unregister(e3) {
              const t3 = this._disposables.indexOf(e3);
              -1 !== t3 && this._disposables.splice(t3, 1);
            }
          }, t2.MutableDisposable = class {
            constructor() {
              this._isDisposed = false;
            }
            get value() {
              return this._isDisposed ? void 0 : this._value;
            }
            set value(e3) {
              var t3;
              this._isDisposed || e3 === this._value || (null === (t3 = this._value) || void 0 === t3 || t3.dispose(), this._value = e3);
            }
            clear() {
              this.value = void 0;
            }
            dispose() {
              var e3;
              this._isDisposed = true, null === (e3 = this._value) || void 0 === e3 || e3.dispose(), this._value = void 0;
            }
          }, t2.toDisposable = function(e3) {
            return { dispose: e3 };
          }, t2.disposeArray = i9, t2.getDisposeArrayDisposable = function(e3) {
            return { dispose: () => i9(e3) };
          };
        }, 1505: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.FourKeyMap = t2.TwoKeyMap = void 0;
          class i9 {
            constructor() {
              this._data = {};
            }
            set(e3, t3, i10) {
              this._data[e3] || (this._data[e3] = {}), this._data[e3][t3] = i10;
            }
            get(e3, t3) {
              return this._data[e3] ? this._data[e3][t3] : void 0;
            }
            clear() {
              this._data = {};
            }
          }
          t2.TwoKeyMap = i9, t2.FourKeyMap = class {
            constructor() {
              this._data = new i9();
            }
            set(e3, t3, s2, r11, n) {
              this._data.get(e3, t3) || this._data.set(e3, t3, new i9()), this._data.get(e3, t3).set(s2, r11, n);
            }
            get(e3, t3, i10, s2) {
              var r11;
              return null === (r11 = this._data.get(e3, t3)) || void 0 === r11 ? void 0 : r11.get(i10, s2);
            }
            clear() {
              this._data.clear();
            }
          };
        }, 6114: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.isChromeOS = t2.isLinux = t2.isWindows = t2.isIphone = t2.isIpad = t2.isMac = t2.getSafariVersion = t2.isSafari = t2.isLegacyEdge = t2.isFirefox = t2.isNode = void 0, t2.isNode = "undefined" == typeof navigator;
          const i9 = t2.isNode ? "node" : navigator.userAgent, s2 = t2.isNode ? "node" : navigator.platform;
          t2.isFirefox = i9.includes("Firefox"), t2.isLegacyEdge = i9.includes("Edge"), t2.isSafari = /^((?!chrome|android).)*safari/i.test(i9), t2.getSafariVersion = function() {
            if (!t2.isSafari) return 0;
            const e3 = i9.match(/Version\/(\d+)/);
            return null === e3 || e3.length < 2 ? 0 : parseInt(e3[1]);
          }, t2.isMac = ["Macintosh", "MacIntel", "MacPPC", "Mac68K"].includes(s2), t2.isIpad = "iPad" === s2, t2.isIphone = "iPhone" === s2, t2.isWindows = ["Windows", "Win16", "Win32", "WinCE"].includes(s2), t2.isLinux = s2.indexOf("Linux") >= 0, t2.isChromeOS = /\bCrOS\b/.test(i9);
        }, 6106: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.SortedList = void 0;
          let i9 = 0;
          t2.SortedList = class {
            constructor(e3) {
              this._getKey = e3, this._array = [];
            }
            clear() {
              this._array.length = 0;
            }
            insert(e3) {
              0 !== this._array.length ? (i9 = this._search(this._getKey(e3)), this._array.splice(i9, 0, e3)) : this._array.push(e3);
            }
            delete(e3) {
              if (0 === this._array.length) return false;
              const t3 = this._getKey(e3);
              if (void 0 === t3) return false;
              if (i9 = this._search(t3), -1 === i9) return false;
              if (this._getKey(this._array[i9]) !== t3) return false;
              do {
                if (this._array[i9] === e3) return this._array.splice(i9, 1), true;
              } while (++i9 < this._array.length && this._getKey(this._array[i9]) === t3);
              return false;
            }
            *getKeyIterator(e3) {
              if (0 !== this._array.length && (i9 = this._search(e3), !(i9 < 0 || i9 >= this._array.length) && this._getKey(this._array[i9]) === e3)) do {
                yield this._array[i9];
              } while (++i9 < this._array.length && this._getKey(this._array[i9]) === e3);
            }
            forEachByKey(e3, t3) {
              if (0 !== this._array.length && (i9 = this._search(e3), !(i9 < 0 || i9 >= this._array.length) && this._getKey(this._array[i9]) === e3)) do {
                t3(this._array[i9]);
              } while (++i9 < this._array.length && this._getKey(this._array[i9]) === e3);
            }
            values() {
              return [...this._array].values();
            }
            _search(e3) {
              let t3 = 0, i10 = this._array.length - 1;
              for (; i10 >= t3; ) {
                let s2 = t3 + i10 >> 1;
                const r11 = this._getKey(this._array[s2]);
                if (r11 > e3) i10 = s2 - 1;
                else {
                  if (!(r11 < e3)) {
                    for (; s2 > 0 && this._getKey(this._array[s2 - 1]) === e3; ) s2--;
                    return s2;
                  }
                  t3 = s2 + 1;
                }
              }
              return t3;
            }
          };
        }, 7226: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.DebouncedIdleTask = t2.IdleTaskQueue = t2.PriorityTaskQueue = void 0;
          const s2 = i9(6114);
          class r11 {
            constructor() {
              this._tasks = [], this._i = 0;
            }
            enqueue(e3) {
              this._tasks.push(e3), this._start();
            }
            flush() {
              for (; this._i < this._tasks.length; ) this._tasks[this._i]() || this._i++;
              this.clear();
            }
            clear() {
              this._idleCallback && (this._cancelCallback(this._idleCallback), this._idleCallback = void 0), this._i = 0, this._tasks.length = 0;
            }
            _start() {
              this._idleCallback || (this._idleCallback = this._requestCallback(this._process.bind(this)));
            }
            _process(e3) {
              this._idleCallback = void 0;
              let t3 = 0, i10 = 0, s3 = e3.timeRemaining(), r12 = 0;
              for (; this._i < this._tasks.length; ) {
                if (t3 = Date.now(), this._tasks[this._i]() || this._i++, t3 = Math.max(1, Date.now() - t3), i10 = Math.max(t3, i10), r12 = e3.timeRemaining(), 1.5 * i10 > r12) return s3 - t3 < -20 && console.warn(`task queue exceeded allotted deadline by ${Math.abs(Math.round(s3 - t3))}ms`), void this._start();
                s3 = r12;
              }
              this.clear();
            }
          }
          class n extends r11 {
            _requestCallback(e3) {
              return setTimeout((() => e3(this._createDeadline(16))));
            }
            _cancelCallback(e3) {
              clearTimeout(e3);
            }
            _createDeadline(e3) {
              const t3 = Date.now() + e3;
              return { timeRemaining: () => Math.max(0, t3 - Date.now()) };
            }
          }
          t2.PriorityTaskQueue = n, t2.IdleTaskQueue = !s2.isNode && "requestIdleCallback" in window ? class extends r11 {
            _requestCallback(e3) {
              return requestIdleCallback(e3);
            }
            _cancelCallback(e3) {
              cancelIdleCallback(e3);
            }
          } : n, t2.DebouncedIdleTask = class {
            constructor() {
              this._queue = new t2.IdleTaskQueue();
            }
            set(e3) {
              this._queue.clear(), this._queue.enqueue(e3);
            }
            flush() {
              this._queue.flush();
            }
          };
        }, 9282: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.updateWindowsModeWrappedState = void 0;
          const s2 = i9(643);
          t2.updateWindowsModeWrappedState = function(e3) {
            const t3 = e3.buffer.lines.get(e3.buffer.ybase + e3.buffer.y - 1), i10 = null == t3 ? void 0 : t3.get(e3.cols - 1), r11 = e3.buffer.lines.get(e3.buffer.ybase + e3.buffer.y);
            r11 && i10 && (r11.isWrapped = i10[s2.CHAR_DATA_CODE_INDEX] !== s2.NULL_CELL_CODE && i10[s2.CHAR_DATA_CODE_INDEX] !== s2.WHITESPACE_CELL_CODE);
          };
        }, 3734: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.ExtendedAttrs = t2.AttributeData = void 0;
          class i9 {
            constructor() {
              this.fg = 0, this.bg = 0, this.extended = new s2();
            }
            static toColorRGB(e3) {
              return [e3 >>> 16 & 255, e3 >>> 8 & 255, 255 & e3];
            }
            static fromColorRGB(e3) {
              return (255 & e3[0]) << 16 | (255 & e3[1]) << 8 | 255 & e3[2];
            }
            clone() {
              const e3 = new i9();
              return e3.fg = this.fg, e3.bg = this.bg, e3.extended = this.extended.clone(), e3;
            }
            isInverse() {
              return 67108864 & this.fg;
            }
            isBold() {
              return 134217728 & this.fg;
            }
            isUnderline() {
              return this.hasExtendedAttrs() && 0 !== this.extended.underlineStyle ? 1 : 268435456 & this.fg;
            }
            isBlink() {
              return 536870912 & this.fg;
            }
            isInvisible() {
              return 1073741824 & this.fg;
            }
            isItalic() {
              return 67108864 & this.bg;
            }
            isDim() {
              return 134217728 & this.bg;
            }
            isStrikethrough() {
              return 2147483648 & this.fg;
            }
            isProtected() {
              return 536870912 & this.bg;
            }
            isOverline() {
              return 1073741824 & this.bg;
            }
            getFgColorMode() {
              return 50331648 & this.fg;
            }
            getBgColorMode() {
              return 50331648 & this.bg;
            }
            isFgRGB() {
              return 50331648 == (50331648 & this.fg);
            }
            isBgRGB() {
              return 50331648 == (50331648 & this.bg);
            }
            isFgPalette() {
              return 16777216 == (50331648 & this.fg) || 33554432 == (50331648 & this.fg);
            }
            isBgPalette() {
              return 16777216 == (50331648 & this.bg) || 33554432 == (50331648 & this.bg);
            }
            isFgDefault() {
              return 0 == (50331648 & this.fg);
            }
            isBgDefault() {
              return 0 == (50331648 & this.bg);
            }
            isAttributeDefault() {
              return 0 === this.fg && 0 === this.bg;
            }
            getFgColor() {
              switch (50331648 & this.fg) {
                case 16777216:
                case 33554432:
                  return 255 & this.fg;
                case 50331648:
                  return 16777215 & this.fg;
                default:
                  return -1;
              }
            }
            getBgColor() {
              switch (50331648 & this.bg) {
                case 16777216:
                case 33554432:
                  return 255 & this.bg;
                case 50331648:
                  return 16777215 & this.bg;
                default:
                  return -1;
              }
            }
            hasExtendedAttrs() {
              return 268435456 & this.bg;
            }
            updateExtended() {
              this.extended.isEmpty() ? this.bg &= -268435457 : this.bg |= 268435456;
            }
            getUnderlineColor() {
              if (268435456 & this.bg && ~this.extended.underlineColor) switch (50331648 & this.extended.underlineColor) {
                case 16777216:
                case 33554432:
                  return 255 & this.extended.underlineColor;
                case 50331648:
                  return 16777215 & this.extended.underlineColor;
                default:
                  return this.getFgColor();
              }
              return this.getFgColor();
            }
            getUnderlineColorMode() {
              return 268435456 & this.bg && ~this.extended.underlineColor ? 50331648 & this.extended.underlineColor : this.getFgColorMode();
            }
            isUnderlineColorRGB() {
              return 268435456 & this.bg && ~this.extended.underlineColor ? 50331648 == (50331648 & this.extended.underlineColor) : this.isFgRGB();
            }
            isUnderlineColorPalette() {
              return 268435456 & this.bg && ~this.extended.underlineColor ? 16777216 == (50331648 & this.extended.underlineColor) || 33554432 == (50331648 & this.extended.underlineColor) : this.isFgPalette();
            }
            isUnderlineColorDefault() {
              return 268435456 & this.bg && ~this.extended.underlineColor ? 0 == (50331648 & this.extended.underlineColor) : this.isFgDefault();
            }
            getUnderlineStyle() {
              return 268435456 & this.fg ? 268435456 & this.bg ? this.extended.underlineStyle : 1 : 0;
            }
          }
          t2.AttributeData = i9;
          class s2 {
            get ext() {
              return this._urlId ? -469762049 & this._ext | this.underlineStyle << 26 : this._ext;
            }
            set ext(e3) {
              this._ext = e3;
            }
            get underlineStyle() {
              return this._urlId ? 5 : (469762048 & this._ext) >> 26;
            }
            set underlineStyle(e3) {
              this._ext &= -469762049, this._ext |= e3 << 26 & 469762048;
            }
            get underlineColor() {
              return 67108863 & this._ext;
            }
            set underlineColor(e3) {
              this._ext &= -67108864, this._ext |= 67108863 & e3;
            }
            get urlId() {
              return this._urlId;
            }
            set urlId(e3) {
              this._urlId = e3;
            }
            constructor(e3 = 0, t3 = 0) {
              this._ext = 0, this._urlId = 0, this._ext = e3, this._urlId = t3;
            }
            clone() {
              return new s2(this._ext, this._urlId);
            }
            isEmpty() {
              return 0 === this.underlineStyle && 0 === this._urlId;
            }
          }
          t2.ExtendedAttrs = s2;
        }, 9092: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.Buffer = t2.MAX_BUFFER_SIZE = void 0;
          const s2 = i9(6349), r11 = i9(7226), n = i9(3734), o2 = i9(8437), a = i9(4634), h2 = i9(511), c = i9(643), l2 = i9(4863), d = i9(7116);
          t2.MAX_BUFFER_SIZE = 4294967295, t2.Buffer = class {
            constructor(e3, t3, i10) {
              this._hasScrollback = e3, this._optionsService = t3, this._bufferService = i10, this.ydisp = 0, this.ybase = 0, this.y = 0, this.x = 0, this.tabs = {}, this.savedY = 0, this.savedX = 0, this.savedCurAttrData = o2.DEFAULT_ATTR_DATA.clone(), this.savedCharset = d.DEFAULT_CHARSET, this.markers = [], this._nullCell = h2.CellData.fromCharData([0, c.NULL_CELL_CHAR, c.NULL_CELL_WIDTH, c.NULL_CELL_CODE]), this._whitespaceCell = h2.CellData.fromCharData([0, c.WHITESPACE_CELL_CHAR, c.WHITESPACE_CELL_WIDTH, c.WHITESPACE_CELL_CODE]), this._isClearing = false, this._memoryCleanupQueue = new r11.IdleTaskQueue(), this._memoryCleanupPosition = 0, this._cols = this._bufferService.cols, this._rows = this._bufferService.rows, this.lines = new s2.CircularList(this._getCorrectBufferLength(this._rows)), this.scrollTop = 0, this.scrollBottom = this._rows - 1, this.setupTabStops();
            }
            getNullCell(e3) {
              return e3 ? (this._nullCell.fg = e3.fg, this._nullCell.bg = e3.bg, this._nullCell.extended = e3.extended) : (this._nullCell.fg = 0, this._nullCell.bg = 0, this._nullCell.extended = new n.ExtendedAttrs()), this._nullCell;
            }
            getWhitespaceCell(e3) {
              return e3 ? (this._whitespaceCell.fg = e3.fg, this._whitespaceCell.bg = e3.bg, this._whitespaceCell.extended = e3.extended) : (this._whitespaceCell.fg = 0, this._whitespaceCell.bg = 0, this._whitespaceCell.extended = new n.ExtendedAttrs()), this._whitespaceCell;
            }
            getBlankLine(e3, t3) {
              return new o2.BufferLine(this._bufferService.cols, this.getNullCell(e3), t3);
            }
            get hasScrollback() {
              return this._hasScrollback && this.lines.maxLength > this._rows;
            }
            get isCursorInViewport() {
              const e3 = this.ybase + this.y - this.ydisp;
              return e3 >= 0 && e3 < this._rows;
            }
            _getCorrectBufferLength(e3) {
              if (!this._hasScrollback) return e3;
              const i10 = e3 + this._optionsService.rawOptions.scrollback;
              return i10 > t2.MAX_BUFFER_SIZE ? t2.MAX_BUFFER_SIZE : i10;
            }
            fillViewportRows(e3) {
              if (0 === this.lines.length) {
                void 0 === e3 && (e3 = o2.DEFAULT_ATTR_DATA);
                let t3 = this._rows;
                for (; t3--; ) this.lines.push(this.getBlankLine(e3));
              }
            }
            clear() {
              this.ydisp = 0, this.ybase = 0, this.y = 0, this.x = 0, this.lines = new s2.CircularList(this._getCorrectBufferLength(this._rows)), this.scrollTop = 0, this.scrollBottom = this._rows - 1, this.setupTabStops();
            }
            resize(e3, t3) {
              const i10 = this.getNullCell(o2.DEFAULT_ATTR_DATA);
              let s3 = 0;
              const r12 = this._getCorrectBufferLength(t3);
              if (r12 > this.lines.maxLength && (this.lines.maxLength = r12), this.lines.length > 0) {
                if (this._cols < e3) for (let t4 = 0; t4 < this.lines.length; t4++) s3 += +this.lines.get(t4).resize(e3, i10);
                let n2 = 0;
                if (this._rows < t3) for (let s4 = this._rows; s4 < t3; s4++) this.lines.length < t3 + this.ybase && (this._optionsService.rawOptions.windowsMode || void 0 !== this._optionsService.rawOptions.windowsPty.backend || void 0 !== this._optionsService.rawOptions.windowsPty.buildNumber ? this.lines.push(new o2.BufferLine(e3, i10)) : this.ybase > 0 && this.lines.length <= this.ybase + this.y + n2 + 1 ? (this.ybase--, n2++, this.ydisp > 0 && this.ydisp--) : this.lines.push(new o2.BufferLine(e3, i10)));
                else for (let e4 = this._rows; e4 > t3; e4--) this.lines.length > t3 + this.ybase && (this.lines.length > this.ybase + this.y + 1 ? this.lines.pop() : (this.ybase++, this.ydisp++));
                if (r12 < this.lines.maxLength) {
                  const e4 = this.lines.length - r12;
                  e4 > 0 && (this.lines.trimStart(e4), this.ybase = Math.max(this.ybase - e4, 0), this.ydisp = Math.max(this.ydisp - e4, 0), this.savedY = Math.max(this.savedY - e4, 0)), this.lines.maxLength = r12;
                }
                this.x = Math.min(this.x, e3 - 1), this.y = Math.min(this.y, t3 - 1), n2 && (this.y += n2), this.savedX = Math.min(this.savedX, e3 - 1), this.scrollTop = 0;
              }
              if (this.scrollBottom = t3 - 1, this._isReflowEnabled && (this._reflow(e3, t3), this._cols > e3)) for (let t4 = 0; t4 < this.lines.length; t4++) s3 += +this.lines.get(t4).resize(e3, i10);
              this._cols = e3, this._rows = t3, this._memoryCleanupQueue.clear(), s3 > 0.1 * this.lines.length && (this._memoryCleanupPosition = 0, this._memoryCleanupQueue.enqueue((() => this._batchedMemoryCleanup())));
            }
            _batchedMemoryCleanup() {
              let e3 = true;
              this._memoryCleanupPosition >= this.lines.length && (this._memoryCleanupPosition = 0, e3 = false);
              let t3 = 0;
              for (; this._memoryCleanupPosition < this.lines.length; ) if (t3 += this.lines.get(this._memoryCleanupPosition++).cleanupMemory(), t3 > 100) return true;
              return e3;
            }
            get _isReflowEnabled() {
              const e3 = this._optionsService.rawOptions.windowsPty;
              return e3 && e3.buildNumber ? this._hasScrollback && "conpty" === e3.backend && e3.buildNumber >= 21376 : this._hasScrollback && !this._optionsService.rawOptions.windowsMode;
            }
            _reflow(e3, t3) {
              this._cols !== e3 && (e3 > this._cols ? this._reflowLarger(e3, t3) : this._reflowSmaller(e3, t3));
            }
            _reflowLarger(e3, t3) {
              const i10 = (0, a.reflowLargerGetLinesToRemove)(this.lines, this._cols, e3, this.ybase + this.y, this.getNullCell(o2.DEFAULT_ATTR_DATA));
              if (i10.length > 0) {
                const s3 = (0, a.reflowLargerCreateNewLayout)(this.lines, i10);
                (0, a.reflowLargerApplyNewLayout)(this.lines, s3.layout), this._reflowLargerAdjustViewport(e3, t3, s3.countRemoved);
              }
            }
            _reflowLargerAdjustViewport(e3, t3, i10) {
              const s3 = this.getNullCell(o2.DEFAULT_ATTR_DATA);
              let r12 = i10;
              for (; r12-- > 0; ) 0 === this.ybase ? (this.y > 0 && this.y--, this.lines.length < t3 && this.lines.push(new o2.BufferLine(e3, s3))) : (this.ydisp === this.ybase && this.ydisp--, this.ybase--);
              this.savedY = Math.max(this.savedY - i10, 0);
            }
            _reflowSmaller(e3, t3) {
              const i10 = this.getNullCell(o2.DEFAULT_ATTR_DATA), s3 = [];
              let r12 = 0;
              for (let n2 = this.lines.length - 1; n2 >= 0; n2--) {
                let h3 = this.lines.get(n2);
                if (!h3 || !h3.isWrapped && h3.getTrimmedLength() <= e3) continue;
                const c2 = [h3];
                for (; h3.isWrapped && n2 > 0; ) h3 = this.lines.get(--n2), c2.unshift(h3);
                const l3 = this.ybase + this.y;
                if (l3 >= n2 && l3 < n2 + c2.length) continue;
                const d2 = c2[c2.length - 1].getTrimmedLength(), _4 = (0, a.reflowSmallerGetNewLineLengths)(c2, this._cols, e3), u = _4.length - c2.length;
                let f;
                f = 0 === this.ybase && this.y !== this.lines.length - 1 ? Math.max(0, this.y - this.lines.maxLength + u) : Math.max(0, this.lines.length - this.lines.maxLength + u);
                const v3 = [];
                for (let e4 = 0; e4 < u; e4++) {
                  const e5 = this.getBlankLine(o2.DEFAULT_ATTR_DATA, true);
                  v3.push(e5);
                }
                v3.length > 0 && (s3.push({ start: n2 + c2.length + r12, newLines: v3 }), r12 += v3.length), c2.push(...v3);
                let p = _4.length - 1, g2 = _4[p];
                0 === g2 && (p--, g2 = _4[p]);
                let m = c2.length - u - 1, S2 = d2;
                for (; m >= 0; ) {
                  const e4 = Math.min(S2, g2);
                  if (void 0 === c2[p]) break;
                  if (c2[p].copyCellsFrom(c2[m], S2 - e4, g2 - e4, e4, true), g2 -= e4, 0 === g2 && (p--, g2 = _4[p]), S2 -= e4, 0 === S2) {
                    m--;
                    const e5 = Math.max(m, 0);
                    S2 = (0, a.getWrappedLineTrimmedLength)(c2, e5, this._cols);
                  }
                }
                for (let t4 = 0; t4 < c2.length; t4++) _4[t4] < e3 && c2[t4].setCell(_4[t4], i10);
                let C4 = u - f;
                for (; C4-- > 0; ) 0 === this.ybase ? this.y < t3 - 1 ? (this.y++, this.lines.pop()) : (this.ybase++, this.ydisp++) : this.ybase < Math.min(this.lines.maxLength, this.lines.length + r12) - t3 && (this.ybase === this.ydisp && this.ydisp++, this.ybase++);
                this.savedY = Math.min(this.savedY + u, this.ybase + t3 - 1);
              }
              if (s3.length > 0) {
                const e4 = [], t4 = [];
                for (let e5 = 0; e5 < this.lines.length; e5++) t4.push(this.lines.get(e5));
                const i11 = this.lines.length;
                let n2 = i11 - 1, o3 = 0, a2 = s3[o3];
                this.lines.length = Math.min(this.lines.maxLength, this.lines.length + r12);
                let h3 = 0;
                for (let c3 = Math.min(this.lines.maxLength - 1, i11 + r12 - 1); c3 >= 0; c3--) if (a2 && a2.start > n2 + h3) {
                  for (let e5 = a2.newLines.length - 1; e5 >= 0; e5--) this.lines.set(c3--, a2.newLines[e5]);
                  c3++, e4.push({ index: n2 + 1, amount: a2.newLines.length }), h3 += a2.newLines.length, a2 = s3[++o3];
                } else this.lines.set(c3, t4[n2--]);
                let c2 = 0;
                for (let t5 = e4.length - 1; t5 >= 0; t5--) e4[t5].index += c2, this.lines.onInsertEmitter.fire(e4[t5]), c2 += e4[t5].amount;
                const l3 = Math.max(0, i11 + r12 - this.lines.maxLength);
                l3 > 0 && this.lines.onTrimEmitter.fire(l3);
              }
            }
            translateBufferLineToString(e3, t3, i10 = 0, s3) {
              const r12 = this.lines.get(e3);
              return r12 ? r12.translateToString(t3, i10, s3) : "";
            }
            getWrappedRangeForLine(e3) {
              let t3 = e3, i10 = e3;
              for (; t3 > 0 && this.lines.get(t3).isWrapped; ) t3--;
              for (; i10 + 1 < this.lines.length && this.lines.get(i10 + 1).isWrapped; ) i10++;
              return { first: t3, last: i10 };
            }
            setupTabStops(e3) {
              for (null != e3 ? this.tabs[e3] || (e3 = this.prevStop(e3)) : (this.tabs = {}, e3 = 0); e3 < this._cols; e3 += this._optionsService.rawOptions.tabStopWidth) this.tabs[e3] = true;
            }
            prevStop(e3) {
              for (null == e3 && (e3 = this.x); !this.tabs[--e3] && e3 > 0; ) ;
              return e3 >= this._cols ? this._cols - 1 : e3 < 0 ? 0 : e3;
            }
            nextStop(e3) {
              for (null == e3 && (e3 = this.x); !this.tabs[++e3] && e3 < this._cols; ) ;
              return e3 >= this._cols ? this._cols - 1 : e3 < 0 ? 0 : e3;
            }
            clearMarkers(e3) {
              this._isClearing = true;
              for (let t3 = 0; t3 < this.markers.length; t3++) this.markers[t3].line === e3 && (this.markers[t3].dispose(), this.markers.splice(t3--, 1));
              this._isClearing = false;
            }
            clearAllMarkers() {
              this._isClearing = true;
              for (let e3 = 0; e3 < this.markers.length; e3++) this.markers[e3].dispose(), this.markers.splice(e3--, 1);
              this._isClearing = false;
            }
            addMarker(e3) {
              const t3 = new l2.Marker(e3);
              return this.markers.push(t3), t3.register(this.lines.onTrim(((e4) => {
                t3.line -= e4, t3.line < 0 && t3.dispose();
              }))), t3.register(this.lines.onInsert(((e4) => {
                t3.line >= e4.index && (t3.line += e4.amount);
              }))), t3.register(this.lines.onDelete(((e4) => {
                t3.line >= e4.index && t3.line < e4.index + e4.amount && t3.dispose(), t3.line > e4.index && (t3.line -= e4.amount);
              }))), t3.register(t3.onDispose((() => this._removeMarker(t3)))), t3;
            }
            _removeMarker(e3) {
              this._isClearing || this.markers.splice(this.markers.indexOf(e3), 1);
            }
          };
        }, 8437: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.BufferLine = t2.DEFAULT_ATTR_DATA = void 0;
          const s2 = i9(3734), r11 = i9(511), n = i9(643), o2 = i9(482);
          t2.DEFAULT_ATTR_DATA = Object.freeze(new s2.AttributeData());
          let a = 0;
          class h2 {
            constructor(e3, t3, i10 = false) {
              this.isWrapped = i10, this._combined = {}, this._extendedAttrs = {}, this._data = new Uint32Array(3 * e3);
              const s3 = t3 || r11.CellData.fromCharData([0, n.NULL_CELL_CHAR, n.NULL_CELL_WIDTH, n.NULL_CELL_CODE]);
              for (let t4 = 0; t4 < e3; ++t4) this.setCell(t4, s3);
              this.length = e3;
            }
            get(e3) {
              const t3 = this._data[3 * e3 + 0], i10 = 2097151 & t3;
              return [this._data[3 * e3 + 1], 2097152 & t3 ? this._combined[e3] : i10 ? (0, o2.stringFromCodePoint)(i10) : "", t3 >> 22, 2097152 & t3 ? this._combined[e3].charCodeAt(this._combined[e3].length - 1) : i10];
            }
            set(e3, t3) {
              this._data[3 * e3 + 1] = t3[n.CHAR_DATA_ATTR_INDEX], t3[n.CHAR_DATA_CHAR_INDEX].length > 1 ? (this._combined[e3] = t3[1], this._data[3 * e3 + 0] = 2097152 | e3 | t3[n.CHAR_DATA_WIDTH_INDEX] << 22) : this._data[3 * e3 + 0] = t3[n.CHAR_DATA_CHAR_INDEX].charCodeAt(0) | t3[n.CHAR_DATA_WIDTH_INDEX] << 22;
            }
            getWidth(e3) {
              return this._data[3 * e3 + 0] >> 22;
            }
            hasWidth(e3) {
              return 12582912 & this._data[3 * e3 + 0];
            }
            getFg(e3) {
              return this._data[3 * e3 + 1];
            }
            getBg(e3) {
              return this._data[3 * e3 + 2];
            }
            hasContent(e3) {
              return 4194303 & this._data[3 * e3 + 0];
            }
            getCodePoint(e3) {
              const t3 = this._data[3 * e3 + 0];
              return 2097152 & t3 ? this._combined[e3].charCodeAt(this._combined[e3].length - 1) : 2097151 & t3;
            }
            isCombined(e3) {
              return 2097152 & this._data[3 * e3 + 0];
            }
            getString(e3) {
              const t3 = this._data[3 * e3 + 0];
              return 2097152 & t3 ? this._combined[e3] : 2097151 & t3 ? (0, o2.stringFromCodePoint)(2097151 & t3) : "";
            }
            isProtected(e3) {
              return 536870912 & this._data[3 * e3 + 2];
            }
            loadCell(e3, t3) {
              return a = 3 * e3, t3.content = this._data[a + 0], t3.fg = this._data[a + 1], t3.bg = this._data[a + 2], 2097152 & t3.content && (t3.combinedData = this._combined[e3]), 268435456 & t3.bg && (t3.extended = this._extendedAttrs[e3]), t3;
            }
            setCell(e3, t3) {
              2097152 & t3.content && (this._combined[e3] = t3.combinedData), 268435456 & t3.bg && (this._extendedAttrs[e3] = t3.extended), this._data[3 * e3 + 0] = t3.content, this._data[3 * e3 + 1] = t3.fg, this._data[3 * e3 + 2] = t3.bg;
            }
            setCellFromCodePoint(e3, t3, i10, s3, r12, n2) {
              268435456 & r12 && (this._extendedAttrs[e3] = n2), this._data[3 * e3 + 0] = t3 | i10 << 22, this._data[3 * e3 + 1] = s3, this._data[3 * e3 + 2] = r12;
            }
            addCodepointToCell(e3, t3) {
              let i10 = this._data[3 * e3 + 0];
              2097152 & i10 ? this._combined[e3] += (0, o2.stringFromCodePoint)(t3) : (2097151 & i10 ? (this._combined[e3] = (0, o2.stringFromCodePoint)(2097151 & i10) + (0, o2.stringFromCodePoint)(t3), i10 &= -2097152, i10 |= 2097152) : i10 = t3 | 1 << 22, this._data[3 * e3 + 0] = i10);
            }
            insertCells(e3, t3, i10, n2) {
              if ((e3 %= this.length) && 2 === this.getWidth(e3 - 1) && this.setCellFromCodePoint(e3 - 1, 0, 1, (null == n2 ? void 0 : n2.fg) || 0, (null == n2 ? void 0 : n2.bg) || 0, (null == n2 ? void 0 : n2.extended) || new s2.ExtendedAttrs()), t3 < this.length - e3) {
                const s3 = new r11.CellData();
                for (let i11 = this.length - e3 - t3 - 1; i11 >= 0; --i11) this.setCell(e3 + t3 + i11, this.loadCell(e3 + i11, s3));
                for (let s4 = 0; s4 < t3; ++s4) this.setCell(e3 + s4, i10);
              } else for (let t4 = e3; t4 < this.length; ++t4) this.setCell(t4, i10);
              2 === this.getWidth(this.length - 1) && this.setCellFromCodePoint(this.length - 1, 0, 1, (null == n2 ? void 0 : n2.fg) || 0, (null == n2 ? void 0 : n2.bg) || 0, (null == n2 ? void 0 : n2.extended) || new s2.ExtendedAttrs());
            }
            deleteCells(e3, t3, i10, n2) {
              if (e3 %= this.length, t3 < this.length - e3) {
                const s3 = new r11.CellData();
                for (let i11 = 0; i11 < this.length - e3 - t3; ++i11) this.setCell(e3 + i11, this.loadCell(e3 + t3 + i11, s3));
                for (let e4 = this.length - t3; e4 < this.length; ++e4) this.setCell(e4, i10);
              } else for (let t4 = e3; t4 < this.length; ++t4) this.setCell(t4, i10);
              e3 && 2 === this.getWidth(e3 - 1) && this.setCellFromCodePoint(e3 - 1, 0, 1, (null == n2 ? void 0 : n2.fg) || 0, (null == n2 ? void 0 : n2.bg) || 0, (null == n2 ? void 0 : n2.extended) || new s2.ExtendedAttrs()), 0 !== this.getWidth(e3) || this.hasContent(e3) || this.setCellFromCodePoint(e3, 0, 1, (null == n2 ? void 0 : n2.fg) || 0, (null == n2 ? void 0 : n2.bg) || 0, (null == n2 ? void 0 : n2.extended) || new s2.ExtendedAttrs());
            }
            replaceCells(e3, t3, i10, r12, n2 = false) {
              if (n2) for (e3 && 2 === this.getWidth(e3 - 1) && !this.isProtected(e3 - 1) && this.setCellFromCodePoint(e3 - 1, 0, 1, (null == r12 ? void 0 : r12.fg) || 0, (null == r12 ? void 0 : r12.bg) || 0, (null == r12 ? void 0 : r12.extended) || new s2.ExtendedAttrs()), t3 < this.length && 2 === this.getWidth(t3 - 1) && !this.isProtected(t3) && this.setCellFromCodePoint(t3, 0, 1, (null == r12 ? void 0 : r12.fg) || 0, (null == r12 ? void 0 : r12.bg) || 0, (null == r12 ? void 0 : r12.extended) || new s2.ExtendedAttrs()); e3 < t3 && e3 < this.length; ) this.isProtected(e3) || this.setCell(e3, i10), e3++;
              else for (e3 && 2 === this.getWidth(e3 - 1) && this.setCellFromCodePoint(e3 - 1, 0, 1, (null == r12 ? void 0 : r12.fg) || 0, (null == r12 ? void 0 : r12.bg) || 0, (null == r12 ? void 0 : r12.extended) || new s2.ExtendedAttrs()), t3 < this.length && 2 === this.getWidth(t3 - 1) && this.setCellFromCodePoint(t3, 0, 1, (null == r12 ? void 0 : r12.fg) || 0, (null == r12 ? void 0 : r12.bg) || 0, (null == r12 ? void 0 : r12.extended) || new s2.ExtendedAttrs()); e3 < t3 && e3 < this.length; ) this.setCell(e3++, i10);
            }
            resize(e3, t3) {
              if (e3 === this.length) return 4 * this._data.length * 2 < this._data.buffer.byteLength;
              const i10 = 3 * e3;
              if (e3 > this.length) {
                if (this._data.buffer.byteLength >= 4 * i10) this._data = new Uint32Array(this._data.buffer, 0, i10);
                else {
                  const e4 = new Uint32Array(i10);
                  e4.set(this._data), this._data = e4;
                }
                for (let i11 = this.length; i11 < e3; ++i11) this.setCell(i11, t3);
              } else {
                this._data = this._data.subarray(0, i10);
                const t4 = Object.keys(this._combined);
                for (let i11 = 0; i11 < t4.length; i11++) {
                  const s4 = parseInt(t4[i11], 10);
                  s4 >= e3 && delete this._combined[s4];
                }
                const s3 = Object.keys(this._extendedAttrs);
                for (let t5 = 0; t5 < s3.length; t5++) {
                  const i11 = parseInt(s3[t5], 10);
                  i11 >= e3 && delete this._extendedAttrs[i11];
                }
              }
              return this.length = e3, 4 * i10 * 2 < this._data.buffer.byteLength;
            }
            cleanupMemory() {
              if (4 * this._data.length * 2 < this._data.buffer.byteLength) {
                const e3 = new Uint32Array(this._data.length);
                return e3.set(this._data), this._data = e3, 1;
              }
              return 0;
            }
            fill(e3, t3 = false) {
              if (t3) for (let t4 = 0; t4 < this.length; ++t4) this.isProtected(t4) || this.setCell(t4, e3);
              else {
                this._combined = {}, this._extendedAttrs = {};
                for (let t4 = 0; t4 < this.length; ++t4) this.setCell(t4, e3);
              }
            }
            copyFrom(e3) {
              this.length !== e3.length ? this._data = new Uint32Array(e3._data) : this._data.set(e3._data), this.length = e3.length, this._combined = {};
              for (const t3 in e3._combined) this._combined[t3] = e3._combined[t3];
              this._extendedAttrs = {};
              for (const t3 in e3._extendedAttrs) this._extendedAttrs[t3] = e3._extendedAttrs[t3];
              this.isWrapped = e3.isWrapped;
            }
            clone() {
              const e3 = new h2(0);
              e3._data = new Uint32Array(this._data), e3.length = this.length;
              for (const t3 in this._combined) e3._combined[t3] = this._combined[t3];
              for (const t3 in this._extendedAttrs) e3._extendedAttrs[t3] = this._extendedAttrs[t3];
              return e3.isWrapped = this.isWrapped, e3;
            }
            getTrimmedLength() {
              for (let e3 = this.length - 1; e3 >= 0; --e3) if (4194303 & this._data[3 * e3 + 0]) return e3 + (this._data[3 * e3 + 0] >> 22);
              return 0;
            }
            getNoBgTrimmedLength() {
              for (let e3 = this.length - 1; e3 >= 0; --e3) if (4194303 & this._data[3 * e3 + 0] || 50331648 & this._data[3 * e3 + 2]) return e3 + (this._data[3 * e3 + 0] >> 22);
              return 0;
            }
            copyCellsFrom(e3, t3, i10, s3, r12) {
              const n2 = e3._data;
              if (r12) for (let r13 = s3 - 1; r13 >= 0; r13--) {
                for (let e4 = 0; e4 < 3; e4++) this._data[3 * (i10 + r13) + e4] = n2[3 * (t3 + r13) + e4];
                268435456 & n2[3 * (t3 + r13) + 2] && (this._extendedAttrs[i10 + r13] = e3._extendedAttrs[t3 + r13]);
              }
              else for (let r13 = 0; r13 < s3; r13++) {
                for (let e4 = 0; e4 < 3; e4++) this._data[3 * (i10 + r13) + e4] = n2[3 * (t3 + r13) + e4];
                268435456 & n2[3 * (t3 + r13) + 2] && (this._extendedAttrs[i10 + r13] = e3._extendedAttrs[t3 + r13]);
              }
              const o3 = Object.keys(e3._combined);
              for (let s4 = 0; s4 < o3.length; s4++) {
                const r13 = parseInt(o3[s4], 10);
                r13 >= t3 && (this._combined[r13 - t3 + i10] = e3._combined[r13]);
              }
            }
            translateToString(e3 = false, t3 = 0, i10 = this.length) {
              e3 && (i10 = Math.min(i10, this.getTrimmedLength()));
              let s3 = "";
              for (; t3 < i10; ) {
                const e4 = this._data[3 * t3 + 0], i11 = 2097151 & e4;
                s3 += 2097152 & e4 ? this._combined[t3] : i11 ? (0, o2.stringFromCodePoint)(i11) : n.WHITESPACE_CELL_CHAR, t3 += e4 >> 22 || 1;
              }
              return s3;
            }
          }
          t2.BufferLine = h2;
        }, 4841: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.getRangeLength = void 0, t2.getRangeLength = function(e3, t3) {
            if (e3.start.y > e3.end.y) throw new Error(`Buffer range end (${e3.end.x}, ${e3.end.y}) cannot be before start (${e3.start.x}, ${e3.start.y})`);
            return t3 * (e3.end.y - e3.start.y) + (e3.end.x - e3.start.x + 1);
          };
        }, 4634: (e2, t2) => {
          function i9(e3, t3, i10) {
            if (t3 === e3.length - 1) return e3[t3].getTrimmedLength();
            const s2 = !e3[t3].hasContent(i10 - 1) && 1 === e3[t3].getWidth(i10 - 1), r11 = 2 === e3[t3 + 1].getWidth(0);
            return s2 && r11 ? i10 - 1 : i10;
          }
          Object.defineProperty(t2, "__esModule", { value: true }), t2.getWrappedLineTrimmedLength = t2.reflowSmallerGetNewLineLengths = t2.reflowLargerApplyNewLayout = t2.reflowLargerCreateNewLayout = t2.reflowLargerGetLinesToRemove = void 0, t2.reflowLargerGetLinesToRemove = function(e3, t3, s2, r11, n) {
            const o2 = [];
            for (let a = 0; a < e3.length - 1; a++) {
              let h2 = a, c = e3.get(++h2);
              if (!c.isWrapped) continue;
              const l2 = [e3.get(a)];
              for (; h2 < e3.length && c.isWrapped; ) l2.push(c), c = e3.get(++h2);
              if (r11 >= a && r11 < h2) {
                a += l2.length - 1;
                continue;
              }
              let d = 0, _4 = i9(l2, d, t3), u = 1, f = 0;
              for (; u < l2.length; ) {
                const e4 = i9(l2, u, t3), r12 = e4 - f, o3 = s2 - _4, a2 = Math.min(r12, o3);
                l2[d].copyCellsFrom(l2[u], f, _4, a2, false), _4 += a2, _4 === s2 && (d++, _4 = 0), f += a2, f === e4 && (u++, f = 0), 0 === _4 && 0 !== d && 2 === l2[d - 1].getWidth(s2 - 1) && (l2[d].copyCellsFrom(l2[d - 1], s2 - 1, _4++, 1, false), l2[d - 1].setCell(s2 - 1, n));
              }
              l2[d].replaceCells(_4, s2, n);
              let v3 = 0;
              for (let e4 = l2.length - 1; e4 > 0 && (e4 > d || 0 === l2[e4].getTrimmedLength()); e4--) v3++;
              v3 > 0 && (o2.push(a + l2.length - v3), o2.push(v3)), a += l2.length - 1;
            }
            return o2;
          }, t2.reflowLargerCreateNewLayout = function(e3, t3) {
            const i10 = [];
            let s2 = 0, r11 = t3[s2], n = 0;
            for (let o2 = 0; o2 < e3.length; o2++) if (r11 === o2) {
              const i11 = t3[++s2];
              e3.onDeleteEmitter.fire({ index: o2 - n, amount: i11 }), o2 += i11 - 1, n += i11, r11 = t3[++s2];
            } else i10.push(o2);
            return { layout: i10, countRemoved: n };
          }, t2.reflowLargerApplyNewLayout = function(e3, t3) {
            const i10 = [];
            for (let s2 = 0; s2 < t3.length; s2++) i10.push(e3.get(t3[s2]));
            for (let t4 = 0; t4 < i10.length; t4++) e3.set(t4, i10[t4]);
            e3.length = t3.length;
          }, t2.reflowSmallerGetNewLineLengths = function(e3, t3, s2) {
            const r11 = [], n = e3.map(((s3, r12) => i9(e3, r12, t3))).reduce(((e4, t4) => e4 + t4));
            let o2 = 0, a = 0, h2 = 0;
            for (; h2 < n; ) {
              if (n - h2 < s2) {
                r11.push(n - h2);
                break;
              }
              o2 += s2;
              const c = i9(e3, a, t3);
              o2 > c && (o2 -= c, a++);
              const l2 = 2 === e3[a].getWidth(o2 - 1);
              l2 && o2--;
              const d = l2 ? s2 - 1 : s2;
              r11.push(d), h2 += d;
            }
            return r11;
          }, t2.getWrappedLineTrimmedLength = i9;
        }, 5295: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.BufferSet = void 0;
          const s2 = i9(8460), r11 = i9(844), n = i9(9092);
          class o2 extends r11.Disposable {
            constructor(e3, t3) {
              super(), this._optionsService = e3, this._bufferService = t3, this._onBufferActivate = this.register(new s2.EventEmitter()), this.onBufferActivate = this._onBufferActivate.event, this.reset(), this.register(this._optionsService.onSpecificOptionChange("scrollback", (() => this.resize(this._bufferService.cols, this._bufferService.rows)))), this.register(this._optionsService.onSpecificOptionChange("tabStopWidth", (() => this.setupTabStops())));
            }
            reset() {
              this._normal = new n.Buffer(true, this._optionsService, this._bufferService), this._normal.fillViewportRows(), this._alt = new n.Buffer(false, this._optionsService, this._bufferService), this._activeBuffer = this._normal, this._onBufferActivate.fire({ activeBuffer: this._normal, inactiveBuffer: this._alt }), this.setupTabStops();
            }
            get alt() {
              return this._alt;
            }
            get active() {
              return this._activeBuffer;
            }
            get normal() {
              return this._normal;
            }
            activateNormalBuffer() {
              this._activeBuffer !== this._normal && (this._normal.x = this._alt.x, this._normal.y = this._alt.y, this._alt.clearAllMarkers(), this._alt.clear(), this._activeBuffer = this._normal, this._onBufferActivate.fire({ activeBuffer: this._normal, inactiveBuffer: this._alt }));
            }
            activateAltBuffer(e3) {
              this._activeBuffer !== this._alt && (this._alt.fillViewportRows(e3), this._alt.x = this._normal.x, this._alt.y = this._normal.y, this._activeBuffer = this._alt, this._onBufferActivate.fire({ activeBuffer: this._alt, inactiveBuffer: this._normal }));
            }
            resize(e3, t3) {
              this._normal.resize(e3, t3), this._alt.resize(e3, t3), this.setupTabStops(e3);
            }
            setupTabStops(e3) {
              this._normal.setupTabStops(e3), this._alt.setupTabStops(e3);
            }
          }
          t2.BufferSet = o2;
        }, 511: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.CellData = void 0;
          const s2 = i9(482), r11 = i9(643), n = i9(3734);
          class o2 extends n.AttributeData {
            constructor() {
              super(...arguments), this.content = 0, this.fg = 0, this.bg = 0, this.extended = new n.ExtendedAttrs(), this.combinedData = "";
            }
            static fromCharData(e3) {
              const t3 = new o2();
              return t3.setFromCharData(e3), t3;
            }
            isCombined() {
              return 2097152 & this.content;
            }
            getWidth() {
              return this.content >> 22;
            }
            getChars() {
              return 2097152 & this.content ? this.combinedData : 2097151 & this.content ? (0, s2.stringFromCodePoint)(2097151 & this.content) : "";
            }
            getCode() {
              return this.isCombined() ? this.combinedData.charCodeAt(this.combinedData.length - 1) : 2097151 & this.content;
            }
            setFromCharData(e3) {
              this.fg = e3[r11.CHAR_DATA_ATTR_INDEX], this.bg = 0;
              let t3 = false;
              if (e3[r11.CHAR_DATA_CHAR_INDEX].length > 2) t3 = true;
              else if (2 === e3[r11.CHAR_DATA_CHAR_INDEX].length) {
                const i10 = e3[r11.CHAR_DATA_CHAR_INDEX].charCodeAt(0);
                if (55296 <= i10 && i10 <= 56319) {
                  const s3 = e3[r11.CHAR_DATA_CHAR_INDEX].charCodeAt(1);
                  56320 <= s3 && s3 <= 57343 ? this.content = 1024 * (i10 - 55296) + s3 - 56320 + 65536 | e3[r11.CHAR_DATA_WIDTH_INDEX] << 22 : t3 = true;
                } else t3 = true;
              } else this.content = e3[r11.CHAR_DATA_CHAR_INDEX].charCodeAt(0) | e3[r11.CHAR_DATA_WIDTH_INDEX] << 22;
              t3 && (this.combinedData = e3[r11.CHAR_DATA_CHAR_INDEX], this.content = 2097152 | e3[r11.CHAR_DATA_WIDTH_INDEX] << 22);
            }
            getAsCharData() {
              return [this.fg, this.getChars(), this.getWidth(), this.getCode()];
            }
          }
          t2.CellData = o2;
        }, 643: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.WHITESPACE_CELL_CODE = t2.WHITESPACE_CELL_WIDTH = t2.WHITESPACE_CELL_CHAR = t2.NULL_CELL_CODE = t2.NULL_CELL_WIDTH = t2.NULL_CELL_CHAR = t2.CHAR_DATA_CODE_INDEX = t2.CHAR_DATA_WIDTH_INDEX = t2.CHAR_DATA_CHAR_INDEX = t2.CHAR_DATA_ATTR_INDEX = t2.DEFAULT_EXT = t2.DEFAULT_ATTR = t2.DEFAULT_COLOR = void 0, t2.DEFAULT_COLOR = 0, t2.DEFAULT_ATTR = 256 | t2.DEFAULT_COLOR << 9, t2.DEFAULT_EXT = 0, t2.CHAR_DATA_ATTR_INDEX = 0, t2.CHAR_DATA_CHAR_INDEX = 1, t2.CHAR_DATA_WIDTH_INDEX = 2, t2.CHAR_DATA_CODE_INDEX = 3, t2.NULL_CELL_CHAR = "", t2.NULL_CELL_WIDTH = 1, t2.NULL_CELL_CODE = 0, t2.WHITESPACE_CELL_CHAR = " ", t2.WHITESPACE_CELL_WIDTH = 1, t2.WHITESPACE_CELL_CODE = 32;
        }, 4863: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.Marker = void 0;
          const s2 = i9(8460), r11 = i9(844);
          class n {
            get id() {
              return this._id;
            }
            constructor(e3) {
              this.line = e3, this.isDisposed = false, this._disposables = [], this._id = n._nextId++, this._onDispose = this.register(new s2.EventEmitter()), this.onDispose = this._onDispose.event;
            }
            dispose() {
              this.isDisposed || (this.isDisposed = true, this.line = -1, this._onDispose.fire(), (0, r11.disposeArray)(this._disposables), this._disposables.length = 0);
            }
            register(e3) {
              return this._disposables.push(e3), e3;
            }
          }
          t2.Marker = n, n._nextId = 1;
        }, 7116: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.DEFAULT_CHARSET = t2.CHARSETS = void 0, t2.CHARSETS = {}, t2.DEFAULT_CHARSET = t2.CHARSETS.B, t2.CHARSETS[0] = { "`": "\u25C6", a: "\u2592", b: "\u2409", c: "\u240C", d: "\u240D", e: "\u240A", f: "\xB0", g: "\xB1", h: "\u2424", i: "\u240B", j: "\u2518", k: "\u2510", l: "\u250C", m: "\u2514", n: "\u253C", o: "\u23BA", p: "\u23BB", q: "\u2500", r: "\u23BC", s: "\u23BD", t: "\u251C", u: "\u2524", v: "\u2534", w: "\u252C", x: "\u2502", y: "\u2264", z: "\u2265", "{": "\u03C0", "|": "\u2260", "}": "\xA3", "~": "\xB7" }, t2.CHARSETS.A = { "#": "\xA3" }, t2.CHARSETS.B = void 0, t2.CHARSETS[4] = { "#": "\xA3", "@": "\xBE", "[": "ij", "\\": "\xBD", "]": "|", "{": "\xA8", "|": "f", "}": "\xBC", "~": "\xB4" }, t2.CHARSETS.C = t2.CHARSETS[5] = { "[": "\xC4", "\\": "\xD6", "]": "\xC5", "^": "\xDC", "`": "\xE9", "{": "\xE4", "|": "\xF6", "}": "\xE5", "~": "\xFC" }, t2.CHARSETS.R = { "#": "\xA3", "@": "\xE0", "[": "\xB0", "\\": "\xE7", "]": "\xA7", "{": "\xE9", "|": "\xF9", "}": "\xE8", "~": "\xA8" }, t2.CHARSETS.Q = { "@": "\xE0", "[": "\xE2", "\\": "\xE7", "]": "\xEA", "^": "\xEE", "`": "\xF4", "{": "\xE9", "|": "\xF9", "}": "\xE8", "~": "\xFB" }, t2.CHARSETS.K = { "@": "\xA7", "[": "\xC4", "\\": "\xD6", "]": "\xDC", "{": "\xE4", "|": "\xF6", "}": "\xFC", "~": "\xDF" }, t2.CHARSETS.Y = { "#": "\xA3", "@": "\xA7", "[": "\xB0", "\\": "\xE7", "]": "\xE9", "`": "\xF9", "{": "\xE0", "|": "\xF2", "}": "\xE8", "~": "\xEC" }, t2.CHARSETS.E = t2.CHARSETS[6] = { "@": "\xC4", "[": "\xC6", "\\": "\xD8", "]": "\xC5", "^": "\xDC", "`": "\xE4", "{": "\xE6", "|": "\xF8", "}": "\xE5", "~": "\xFC" }, t2.CHARSETS.Z = { "#": "\xA3", "@": "\xA7", "[": "\xA1", "\\": "\xD1", "]": "\xBF", "{": "\xB0", "|": "\xF1", "}": "\xE7" }, t2.CHARSETS.H = t2.CHARSETS[7] = { "@": "\xC9", "[": "\xC4", "\\": "\xD6", "]": "\xC5", "^": "\xDC", "`": "\xE9", "{": "\xE4", "|": "\xF6", "}": "\xE5", "~": "\xFC" }, t2.CHARSETS["="] = { "#": "\xF9", "@": "\xE0", "[": "\xE9", "\\": "\xE7", "]": "\xEA", "^": "\xEE", _: "\xE8", "`": "\xF4", "{": "\xE4", "|": "\xF6", "}": "\xFC", "~": "\xFB" };
        }, 2584: (e2, t2) => {
          var i9, s2, r11;
          Object.defineProperty(t2, "__esModule", { value: true }), t2.C1_ESCAPED = t2.C1 = t2.C0 = void 0, (function(e3) {
            e3.NUL = "\0", e3.SOH = "", e3.STX = "", e3.ETX = "", e3.EOT = "", e3.ENQ = "", e3.ACK = "", e3.BEL = "\x07", e3.BS = "\b", e3.HT = "	", e3.LF = "\n", e3.VT = "\v", e3.FF = "\f", e3.CR = "\r", e3.SO = "", e3.SI = "", e3.DLE = "", e3.DC1 = "", e3.DC2 = "", e3.DC3 = "", e3.DC4 = "", e3.NAK = "", e3.SYN = "", e3.ETB = "", e3.CAN = "", e3.EM = "", e3.SUB = "", e3.ESC = "\x1B", e3.FS = "", e3.GS = "", e3.RS = "", e3.US = "", e3.SP = " ", e3.DEL = "\x7F";
          })(i9 || (t2.C0 = i9 = {})), (function(e3) {
            e3.PAD = "\x80", e3.HOP = "\x81", e3.BPH = "\x82", e3.NBH = "\x83", e3.IND = "\x84", e3.NEL = "\x85", e3.SSA = "\x86", e3.ESA = "\x87", e3.HTS = "\x88", e3.HTJ = "\x89", e3.VTS = "\x8A", e3.PLD = "\x8B", e3.PLU = "\x8C", e3.RI = "\x8D", e3.SS2 = "\x8E", e3.SS3 = "\x8F", e3.DCS = "\x90", e3.PU1 = "\x91", e3.PU2 = "\x92", e3.STS = "\x93", e3.CCH = "\x94", e3.MW = "\x95", e3.SPA = "\x96", e3.EPA = "\x97", e3.SOS = "\x98", e3.SGCI = "\x99", e3.SCI = "\x9A", e3.CSI = "\x9B", e3.ST = "\x9C", e3.OSC = "\x9D", e3.PM = "\x9E", e3.APC = "\x9F";
          })(s2 || (t2.C1 = s2 = {})), (function(e3) {
            e3.ST = `${i9.ESC}\\`;
          })(r11 || (t2.C1_ESCAPED = r11 = {}));
        }, 7399: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.evaluateKeyboardEvent = void 0;
          const s2 = i9(2584), r11 = { 48: ["0", ")"], 49: ["1", "!"], 50: ["2", "@"], 51: ["3", "#"], 52: ["4", "$"], 53: ["5", "%"], 54: ["6", "^"], 55: ["7", "&"], 56: ["8", "*"], 57: ["9", "("], 186: [";", ":"], 187: ["=", "+"], 188: [",", "<"], 189: ["-", "_"], 190: [".", ">"], 191: ["/", "?"], 192: ["`", "~"], 219: ["[", "{"], 220: ["\\", "|"], 221: ["]", "}"], 222: ["'", '"'] };
          t2.evaluateKeyboardEvent = function(e3, t3, i10, n) {
            const o2 = { type: 0, cancel: false, key: void 0 }, a = (e3.shiftKey ? 1 : 0) | (e3.altKey ? 2 : 0) | (e3.ctrlKey ? 4 : 0) | (e3.metaKey ? 8 : 0);
            switch (e3.keyCode) {
              case 0:
                "UIKeyInputUpArrow" === e3.key ? o2.key = t3 ? s2.C0.ESC + "OA" : s2.C0.ESC + "[A" : "UIKeyInputLeftArrow" === e3.key ? o2.key = t3 ? s2.C0.ESC + "OD" : s2.C0.ESC + "[D" : "UIKeyInputRightArrow" === e3.key ? o2.key = t3 ? s2.C0.ESC + "OC" : s2.C0.ESC + "[C" : "UIKeyInputDownArrow" === e3.key && (o2.key = t3 ? s2.C0.ESC + "OB" : s2.C0.ESC + "[B");
                break;
              case 8:
                if (e3.altKey) {
                  o2.key = s2.C0.ESC + s2.C0.DEL;
                  break;
                }
                o2.key = s2.C0.DEL;
                break;
              case 9:
                if (e3.shiftKey) {
                  o2.key = s2.C0.ESC + "[Z";
                  break;
                }
                o2.key = s2.C0.HT, o2.cancel = true;
                break;
              case 13:
                o2.key = e3.altKey ? s2.C0.ESC + s2.C0.CR : s2.C0.CR, o2.cancel = true;
                break;
              case 27:
                o2.key = s2.C0.ESC, e3.altKey && (o2.key = s2.C0.ESC + s2.C0.ESC), o2.cancel = true;
                break;
              case 37:
                if (e3.metaKey) break;
                a ? (o2.key = s2.C0.ESC + "[1;" + (a + 1) + "D", o2.key === s2.C0.ESC + "[1;3D" && (o2.key = s2.C0.ESC + (i10 ? "b" : "[1;5D"))) : o2.key = t3 ? s2.C0.ESC + "OD" : s2.C0.ESC + "[D";
                break;
              case 39:
                if (e3.metaKey) break;
                a ? (o2.key = s2.C0.ESC + "[1;" + (a + 1) + "C", o2.key === s2.C0.ESC + "[1;3C" && (o2.key = s2.C0.ESC + (i10 ? "f" : "[1;5C"))) : o2.key = t3 ? s2.C0.ESC + "OC" : s2.C0.ESC + "[C";
                break;
              case 38:
                if (e3.metaKey) break;
                a ? (o2.key = s2.C0.ESC + "[1;" + (a + 1) + "A", i10 || o2.key !== s2.C0.ESC + "[1;3A" || (o2.key = s2.C0.ESC + "[1;5A")) : o2.key = t3 ? s2.C0.ESC + "OA" : s2.C0.ESC + "[A";
                break;
              case 40:
                if (e3.metaKey) break;
                a ? (o2.key = s2.C0.ESC + "[1;" + (a + 1) + "B", i10 || o2.key !== s2.C0.ESC + "[1;3B" || (o2.key = s2.C0.ESC + "[1;5B")) : o2.key = t3 ? s2.C0.ESC + "OB" : s2.C0.ESC + "[B";
                break;
              case 45:
                e3.shiftKey || e3.ctrlKey || (o2.key = s2.C0.ESC + "[2~");
                break;
              case 46:
                o2.key = a ? s2.C0.ESC + "[3;" + (a + 1) + "~" : s2.C0.ESC + "[3~";
                break;
              case 36:
                o2.key = a ? s2.C0.ESC + "[1;" + (a + 1) + "H" : t3 ? s2.C0.ESC + "OH" : s2.C0.ESC + "[H";
                break;
              case 35:
                o2.key = a ? s2.C0.ESC + "[1;" + (a + 1) + "F" : t3 ? s2.C0.ESC + "OF" : s2.C0.ESC + "[F";
                break;
              case 33:
                e3.shiftKey ? o2.type = 2 : e3.ctrlKey ? o2.key = s2.C0.ESC + "[5;" + (a + 1) + "~" : o2.key = s2.C0.ESC + "[5~";
                break;
              case 34:
                e3.shiftKey ? o2.type = 3 : e3.ctrlKey ? o2.key = s2.C0.ESC + "[6;" + (a + 1) + "~" : o2.key = s2.C0.ESC + "[6~";
                break;
              case 112:
                o2.key = a ? s2.C0.ESC + "[1;" + (a + 1) + "P" : s2.C0.ESC + "OP";
                break;
              case 113:
                o2.key = a ? s2.C0.ESC + "[1;" + (a + 1) + "Q" : s2.C0.ESC + "OQ";
                break;
              case 114:
                o2.key = a ? s2.C0.ESC + "[1;" + (a + 1) + "R" : s2.C0.ESC + "OR";
                break;
              case 115:
                o2.key = a ? s2.C0.ESC + "[1;" + (a + 1) + "S" : s2.C0.ESC + "OS";
                break;
              case 116:
                o2.key = a ? s2.C0.ESC + "[15;" + (a + 1) + "~" : s2.C0.ESC + "[15~";
                break;
              case 117:
                o2.key = a ? s2.C0.ESC + "[17;" + (a + 1) + "~" : s2.C0.ESC + "[17~";
                break;
              case 118:
                o2.key = a ? s2.C0.ESC + "[18;" + (a + 1) + "~" : s2.C0.ESC + "[18~";
                break;
              case 119:
                o2.key = a ? s2.C0.ESC + "[19;" + (a + 1) + "~" : s2.C0.ESC + "[19~";
                break;
              case 120:
                o2.key = a ? s2.C0.ESC + "[20;" + (a + 1) + "~" : s2.C0.ESC + "[20~";
                break;
              case 121:
                o2.key = a ? s2.C0.ESC + "[21;" + (a + 1) + "~" : s2.C0.ESC + "[21~";
                break;
              case 122:
                o2.key = a ? s2.C0.ESC + "[23;" + (a + 1) + "~" : s2.C0.ESC + "[23~";
                break;
              case 123:
                o2.key = a ? s2.C0.ESC + "[24;" + (a + 1) + "~" : s2.C0.ESC + "[24~";
                break;
              default:
                if (!e3.ctrlKey || e3.shiftKey || e3.altKey || e3.metaKey) if (i10 && !n || !e3.altKey || e3.metaKey) !i10 || e3.altKey || e3.ctrlKey || e3.shiftKey || !e3.metaKey ? e3.key && !e3.ctrlKey && !e3.altKey && !e3.metaKey && e3.keyCode >= 48 && 1 === e3.key.length ? o2.key = e3.key : e3.key && e3.ctrlKey && ("_" === e3.key && (o2.key = s2.C0.US), "@" === e3.key && (o2.key = s2.C0.NUL)) : 65 === e3.keyCode && (o2.type = 1);
                else {
                  const t4 = r11[e3.keyCode], i11 = null == t4 ? void 0 : t4[e3.shiftKey ? 1 : 0];
                  if (i11) o2.key = s2.C0.ESC + i11;
                  else if (e3.keyCode >= 65 && e3.keyCode <= 90) {
                    const t5 = e3.ctrlKey ? e3.keyCode - 64 : e3.keyCode + 32;
                    let i12 = String.fromCharCode(t5);
                    e3.shiftKey && (i12 = i12.toUpperCase()), o2.key = s2.C0.ESC + i12;
                  } else if (32 === e3.keyCode) o2.key = s2.C0.ESC + (e3.ctrlKey ? s2.C0.NUL : " ");
                  else if ("Dead" === e3.key && e3.code.startsWith("Key")) {
                    let t5 = e3.code.slice(3, 4);
                    e3.shiftKey || (t5 = t5.toLowerCase()), o2.key = s2.C0.ESC + t5, o2.cancel = true;
                  }
                }
                else e3.keyCode >= 65 && e3.keyCode <= 90 ? o2.key = String.fromCharCode(e3.keyCode - 64) : 32 === e3.keyCode ? o2.key = s2.C0.NUL : e3.keyCode >= 51 && e3.keyCode <= 55 ? o2.key = String.fromCharCode(e3.keyCode - 51 + 27) : 56 === e3.keyCode ? o2.key = s2.C0.DEL : 219 === e3.keyCode ? o2.key = s2.C0.ESC : 220 === e3.keyCode ? o2.key = s2.C0.FS : 221 === e3.keyCode && (o2.key = s2.C0.GS);
            }
            return o2;
          };
        }, 482: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.Utf8ToUtf32 = t2.StringToUtf32 = t2.utf32ToString = t2.stringFromCodePoint = void 0, t2.stringFromCodePoint = function(e3) {
            return e3 > 65535 ? (e3 -= 65536, String.fromCharCode(55296 + (e3 >> 10)) + String.fromCharCode(e3 % 1024 + 56320)) : String.fromCharCode(e3);
          }, t2.utf32ToString = function(e3, t3 = 0, i9 = e3.length) {
            let s2 = "";
            for (let r11 = t3; r11 < i9; ++r11) {
              let t4 = e3[r11];
              t4 > 65535 ? (t4 -= 65536, s2 += String.fromCharCode(55296 + (t4 >> 10)) + String.fromCharCode(t4 % 1024 + 56320)) : s2 += String.fromCharCode(t4);
            }
            return s2;
          }, t2.StringToUtf32 = class {
            constructor() {
              this._interim = 0;
            }
            clear() {
              this._interim = 0;
            }
            decode(e3, t3) {
              const i9 = e3.length;
              if (!i9) return 0;
              let s2 = 0, r11 = 0;
              if (this._interim) {
                const i10 = e3.charCodeAt(r11++);
                56320 <= i10 && i10 <= 57343 ? t3[s2++] = 1024 * (this._interim - 55296) + i10 - 56320 + 65536 : (t3[s2++] = this._interim, t3[s2++] = i10), this._interim = 0;
              }
              for (let n = r11; n < i9; ++n) {
                const r12 = e3.charCodeAt(n);
                if (55296 <= r12 && r12 <= 56319) {
                  if (++n >= i9) return this._interim = r12, s2;
                  const o2 = e3.charCodeAt(n);
                  56320 <= o2 && o2 <= 57343 ? t3[s2++] = 1024 * (r12 - 55296) + o2 - 56320 + 65536 : (t3[s2++] = r12, t3[s2++] = o2);
                } else 65279 !== r12 && (t3[s2++] = r12);
              }
              return s2;
            }
          }, t2.Utf8ToUtf32 = class {
            constructor() {
              this.interim = new Uint8Array(3);
            }
            clear() {
              this.interim.fill(0);
            }
            decode(e3, t3) {
              const i9 = e3.length;
              if (!i9) return 0;
              let s2, r11, n, o2, a = 0, h2 = 0, c = 0;
              if (this.interim[0]) {
                let s3 = false, r12 = this.interim[0];
                r12 &= 192 == (224 & r12) ? 31 : 224 == (240 & r12) ? 15 : 7;
                let n2, o3 = 0;
                for (; (n2 = 63 & this.interim[++o3]) && o3 < 4; ) r12 <<= 6, r12 |= n2;
                const h3 = 192 == (224 & this.interim[0]) ? 2 : 224 == (240 & this.interim[0]) ? 3 : 4, l3 = h3 - o3;
                for (; c < l3; ) {
                  if (c >= i9) return 0;
                  if (n2 = e3[c++], 128 != (192 & n2)) {
                    c--, s3 = true;
                    break;
                  }
                  this.interim[o3++] = n2, r12 <<= 6, r12 |= 63 & n2;
                }
                s3 || (2 === h3 ? r12 < 128 ? c-- : t3[a++] = r12 : 3 === h3 ? r12 < 2048 || r12 >= 55296 && r12 <= 57343 || 65279 === r12 || (t3[a++] = r12) : r12 < 65536 || r12 > 1114111 || (t3[a++] = r12)), this.interim.fill(0);
              }
              const l2 = i9 - 4;
              let d = c;
              for (; d < i9; ) {
                for (; !(!(d < l2) || 128 & (s2 = e3[d]) || 128 & (r11 = e3[d + 1]) || 128 & (n = e3[d + 2]) || 128 & (o2 = e3[d + 3])); ) t3[a++] = s2, t3[a++] = r11, t3[a++] = n, t3[a++] = o2, d += 4;
                if (s2 = e3[d++], s2 < 128) t3[a++] = s2;
                else if (192 == (224 & s2)) {
                  if (d >= i9) return this.interim[0] = s2, a;
                  if (r11 = e3[d++], 128 != (192 & r11)) {
                    d--;
                    continue;
                  }
                  if (h2 = (31 & s2) << 6 | 63 & r11, h2 < 128) {
                    d--;
                    continue;
                  }
                  t3[a++] = h2;
                } else if (224 == (240 & s2)) {
                  if (d >= i9) return this.interim[0] = s2, a;
                  if (r11 = e3[d++], 128 != (192 & r11)) {
                    d--;
                    continue;
                  }
                  if (d >= i9) return this.interim[0] = s2, this.interim[1] = r11, a;
                  if (n = e3[d++], 128 != (192 & n)) {
                    d--;
                    continue;
                  }
                  if (h2 = (15 & s2) << 12 | (63 & r11) << 6 | 63 & n, h2 < 2048 || h2 >= 55296 && h2 <= 57343 || 65279 === h2) continue;
                  t3[a++] = h2;
                } else if (240 == (248 & s2)) {
                  if (d >= i9) return this.interim[0] = s2, a;
                  if (r11 = e3[d++], 128 != (192 & r11)) {
                    d--;
                    continue;
                  }
                  if (d >= i9) return this.interim[0] = s2, this.interim[1] = r11, a;
                  if (n = e3[d++], 128 != (192 & n)) {
                    d--;
                    continue;
                  }
                  if (d >= i9) return this.interim[0] = s2, this.interim[1] = r11, this.interim[2] = n, a;
                  if (o2 = e3[d++], 128 != (192 & o2)) {
                    d--;
                    continue;
                  }
                  if (h2 = (7 & s2) << 18 | (63 & r11) << 12 | (63 & n) << 6 | 63 & o2, h2 < 65536 || h2 > 1114111) continue;
                  t3[a++] = h2;
                }
              }
              return a;
            }
          };
        }, 225: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.UnicodeV6 = void 0;
          const i9 = [[768, 879], [1155, 1158], [1160, 1161], [1425, 1469], [1471, 1471], [1473, 1474], [1476, 1477], [1479, 1479], [1536, 1539], [1552, 1557], [1611, 1630], [1648, 1648], [1750, 1764], [1767, 1768], [1770, 1773], [1807, 1807], [1809, 1809], [1840, 1866], [1958, 1968], [2027, 2035], [2305, 2306], [2364, 2364], [2369, 2376], [2381, 2381], [2385, 2388], [2402, 2403], [2433, 2433], [2492, 2492], [2497, 2500], [2509, 2509], [2530, 2531], [2561, 2562], [2620, 2620], [2625, 2626], [2631, 2632], [2635, 2637], [2672, 2673], [2689, 2690], [2748, 2748], [2753, 2757], [2759, 2760], [2765, 2765], [2786, 2787], [2817, 2817], [2876, 2876], [2879, 2879], [2881, 2883], [2893, 2893], [2902, 2902], [2946, 2946], [3008, 3008], [3021, 3021], [3134, 3136], [3142, 3144], [3146, 3149], [3157, 3158], [3260, 3260], [3263, 3263], [3270, 3270], [3276, 3277], [3298, 3299], [3393, 3395], [3405, 3405], [3530, 3530], [3538, 3540], [3542, 3542], [3633, 3633], [3636, 3642], [3655, 3662], [3761, 3761], [3764, 3769], [3771, 3772], [3784, 3789], [3864, 3865], [3893, 3893], [3895, 3895], [3897, 3897], [3953, 3966], [3968, 3972], [3974, 3975], [3984, 3991], [3993, 4028], [4038, 4038], [4141, 4144], [4146, 4146], [4150, 4151], [4153, 4153], [4184, 4185], [4448, 4607], [4959, 4959], [5906, 5908], [5938, 5940], [5970, 5971], [6002, 6003], [6068, 6069], [6071, 6077], [6086, 6086], [6089, 6099], [6109, 6109], [6155, 6157], [6313, 6313], [6432, 6434], [6439, 6440], [6450, 6450], [6457, 6459], [6679, 6680], [6912, 6915], [6964, 6964], [6966, 6970], [6972, 6972], [6978, 6978], [7019, 7027], [7616, 7626], [7678, 7679], [8203, 8207], [8234, 8238], [8288, 8291], [8298, 8303], [8400, 8431], [12330, 12335], [12441, 12442], [43014, 43014], [43019, 43019], [43045, 43046], [64286, 64286], [65024, 65039], [65056, 65059], [65279, 65279], [65529, 65531]], s2 = [[68097, 68099], [68101, 68102], [68108, 68111], [68152, 68154], [68159, 68159], [119143, 119145], [119155, 119170], [119173, 119179], [119210, 119213], [119362, 119364], [917505, 917505], [917536, 917631], [917760, 917999]];
          let r11;
          t2.UnicodeV6 = class {
            constructor() {
              if (this.version = "6", !r11) {
                r11 = new Uint8Array(65536), r11.fill(1), r11[0] = 0, r11.fill(0, 1, 32), r11.fill(0, 127, 160), r11.fill(2, 4352, 4448), r11[9001] = 2, r11[9002] = 2, r11.fill(2, 11904, 42192), r11[12351] = 1, r11.fill(2, 44032, 55204), r11.fill(2, 63744, 64256), r11.fill(2, 65040, 65050), r11.fill(2, 65072, 65136), r11.fill(2, 65280, 65377), r11.fill(2, 65504, 65511);
                for (let e3 = 0; e3 < i9.length; ++e3) r11.fill(0, i9[e3][0], i9[e3][1] + 1);
              }
            }
            wcwidth(e3) {
              return e3 < 32 ? 0 : e3 < 127 ? 1 : e3 < 65536 ? r11[e3] : (function(e4, t3) {
                let i10, s3 = 0, r12 = t3.length - 1;
                if (e4 < t3[0][0] || e4 > t3[r12][1]) return false;
                for (; r12 >= s3; ) if (i10 = s3 + r12 >> 1, e4 > t3[i10][1]) s3 = i10 + 1;
                else {
                  if (!(e4 < t3[i10][0])) return true;
                  r12 = i10 - 1;
                }
                return false;
              })(e3, s2) ? 0 : e3 >= 131072 && e3 <= 196605 || e3 >= 196608 && e3 <= 262141 ? 2 : 1;
            }
          };
        }, 5981: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.WriteBuffer = void 0;
          const s2 = i9(8460), r11 = i9(844);
          class n extends r11.Disposable {
            constructor(e3) {
              super(), this._action = e3, this._writeBuffer = [], this._callbacks = [], this._pendingData = 0, this._bufferOffset = 0, this._isSyncWriting = false, this._syncCalls = 0, this._didUserInput = false, this._onWriteParsed = this.register(new s2.EventEmitter()), this.onWriteParsed = this._onWriteParsed.event;
            }
            handleUserInput() {
              this._didUserInput = true;
            }
            writeSync(e3, t3) {
              if (void 0 !== t3 && this._syncCalls > t3) return void (this._syncCalls = 0);
              if (this._pendingData += e3.length, this._writeBuffer.push(e3), this._callbacks.push(void 0), this._syncCalls++, this._isSyncWriting) return;
              let i10;
              for (this._isSyncWriting = true; i10 = this._writeBuffer.shift(); ) {
                this._action(i10);
                const e4 = this._callbacks.shift();
                e4 && e4();
              }
              this._pendingData = 0, this._bufferOffset = 2147483647, this._isSyncWriting = false, this._syncCalls = 0;
            }
            write(e3, t3) {
              if (this._pendingData > 5e7) throw new Error("write data discarded, use flow control to avoid losing data");
              if (!this._writeBuffer.length) {
                if (this._bufferOffset = 0, this._didUserInput) return this._didUserInput = false, this._pendingData += e3.length, this._writeBuffer.push(e3), this._callbacks.push(t3), void this._innerWrite();
                setTimeout((() => this._innerWrite()));
              }
              this._pendingData += e3.length, this._writeBuffer.push(e3), this._callbacks.push(t3);
            }
            _innerWrite(e3 = 0, t3 = true) {
              const i10 = e3 || Date.now();
              for (; this._writeBuffer.length > this._bufferOffset; ) {
                const e4 = this._writeBuffer[this._bufferOffset], s3 = this._action(e4, t3);
                if (s3) {
                  const e5 = (e6) => Date.now() - i10 >= 12 ? setTimeout((() => this._innerWrite(0, e6))) : this._innerWrite(i10, e6);
                  return void s3.catch(((e6) => (queueMicrotask((() => {
                    throw e6;
                  })), Promise.resolve(false)))).then(e5);
                }
                const r12 = this._callbacks[this._bufferOffset];
                if (r12 && r12(), this._bufferOffset++, this._pendingData -= e4.length, Date.now() - i10 >= 12) break;
              }
              this._writeBuffer.length > this._bufferOffset ? (this._bufferOffset > 50 && (this._writeBuffer = this._writeBuffer.slice(this._bufferOffset), this._callbacks = this._callbacks.slice(this._bufferOffset), this._bufferOffset = 0), setTimeout((() => this._innerWrite()))) : (this._writeBuffer.length = 0, this._callbacks.length = 0, this._pendingData = 0, this._bufferOffset = 0), this._onWriteParsed.fire();
            }
          }
          t2.WriteBuffer = n;
        }, 5941: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.toRgbString = t2.parseColor = void 0;
          const i9 = /^([\da-f])\/([\da-f])\/([\da-f])$|^([\da-f]{2})\/([\da-f]{2})\/([\da-f]{2})$|^([\da-f]{3})\/([\da-f]{3})\/([\da-f]{3})$|^([\da-f]{4})\/([\da-f]{4})\/([\da-f]{4})$/, s2 = /^[\da-f]+$/;
          function r11(e3, t3) {
            const i10 = e3.toString(16), s3 = i10.length < 2 ? "0" + i10 : i10;
            switch (t3) {
              case 4:
                return i10[0];
              case 8:
                return s3;
              case 12:
                return (s3 + s3).slice(0, 3);
              default:
                return s3 + s3;
            }
          }
          t2.parseColor = function(e3) {
            if (!e3) return;
            let t3 = e3.toLowerCase();
            if (0 === t3.indexOf("rgb:")) {
              t3 = t3.slice(4);
              const e4 = i9.exec(t3);
              if (e4) {
                const t4 = e4[1] ? 15 : e4[4] ? 255 : e4[7] ? 4095 : 65535;
                return [Math.round(parseInt(e4[1] || e4[4] || e4[7] || e4[10], 16) / t4 * 255), Math.round(parseInt(e4[2] || e4[5] || e4[8] || e4[11], 16) / t4 * 255), Math.round(parseInt(e4[3] || e4[6] || e4[9] || e4[12], 16) / t4 * 255)];
              }
            } else if (0 === t3.indexOf("#") && (t3 = t3.slice(1), s2.exec(t3) && [3, 6, 9, 12].includes(t3.length))) {
              const e4 = t3.length / 3, i10 = [0, 0, 0];
              for (let s3 = 0; s3 < 3; ++s3) {
                const r12 = parseInt(t3.slice(e4 * s3, e4 * s3 + e4), 16);
                i10[s3] = 1 === e4 ? r12 << 4 : 2 === e4 ? r12 : 3 === e4 ? r12 >> 4 : r12 >> 8;
              }
              return i10;
            }
          }, t2.toRgbString = function(e3, t3 = 16) {
            const [i10, s3, n] = e3;
            return `rgb:${r11(i10, t3)}/${r11(s3, t3)}/${r11(n, t3)}`;
          };
        }, 5770: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.PAYLOAD_LIMIT = void 0, t2.PAYLOAD_LIMIT = 1e7;
        }, 6351: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.DcsHandler = t2.DcsParser = void 0;
          const s2 = i9(482), r11 = i9(8742), n = i9(5770), o2 = [];
          t2.DcsParser = class {
            constructor() {
              this._handlers = /* @__PURE__ */ Object.create(null), this._active = o2, this._ident = 0, this._handlerFb = () => {
              }, this._stack = { paused: false, loopPosition: 0, fallThrough: false };
            }
            dispose() {
              this._handlers = /* @__PURE__ */ Object.create(null), this._handlerFb = () => {
              }, this._active = o2;
            }
            registerHandler(e3, t3) {
              void 0 === this._handlers[e3] && (this._handlers[e3] = []);
              const i10 = this._handlers[e3];
              return i10.push(t3), { dispose: () => {
                const e4 = i10.indexOf(t3);
                -1 !== e4 && i10.splice(e4, 1);
              } };
            }
            clearHandler(e3) {
              this._handlers[e3] && delete this._handlers[e3];
            }
            setHandlerFallback(e3) {
              this._handlerFb = e3;
            }
            reset() {
              if (this._active.length) for (let e3 = this._stack.paused ? this._stack.loopPosition - 1 : this._active.length - 1; e3 >= 0; --e3) this._active[e3].unhook(false);
              this._stack.paused = false, this._active = o2, this._ident = 0;
            }
            hook(e3, t3) {
              if (this.reset(), this._ident = e3, this._active = this._handlers[e3] || o2, this._active.length) for (let e4 = this._active.length - 1; e4 >= 0; e4--) this._active[e4].hook(t3);
              else this._handlerFb(this._ident, "HOOK", t3);
            }
            put(e3, t3, i10) {
              if (this._active.length) for (let s3 = this._active.length - 1; s3 >= 0; s3--) this._active[s3].put(e3, t3, i10);
              else this._handlerFb(this._ident, "PUT", (0, s2.utf32ToString)(e3, t3, i10));
            }
            unhook(e3, t3 = true) {
              if (this._active.length) {
                let i10 = false, s3 = this._active.length - 1, r12 = false;
                if (this._stack.paused && (s3 = this._stack.loopPosition - 1, i10 = t3, r12 = this._stack.fallThrough, this._stack.paused = false), !r12 && false === i10) {
                  for (; s3 >= 0 && (i10 = this._active[s3].unhook(e3), true !== i10); s3--) if (i10 instanceof Promise) return this._stack.paused = true, this._stack.loopPosition = s3, this._stack.fallThrough = false, i10;
                  s3--;
                }
                for (; s3 >= 0; s3--) if (i10 = this._active[s3].unhook(false), i10 instanceof Promise) return this._stack.paused = true, this._stack.loopPosition = s3, this._stack.fallThrough = true, i10;
              } else this._handlerFb(this._ident, "UNHOOK", e3);
              this._active = o2, this._ident = 0;
            }
          };
          const a = new r11.Params();
          a.addParam(0), t2.DcsHandler = class {
            constructor(e3) {
              this._handler = e3, this._data = "", this._params = a, this._hitLimit = false;
            }
            hook(e3) {
              this._params = e3.length > 1 || e3.params[0] ? e3.clone() : a, this._data = "", this._hitLimit = false;
            }
            put(e3, t3, i10) {
              this._hitLimit || (this._data += (0, s2.utf32ToString)(e3, t3, i10), this._data.length > n.PAYLOAD_LIMIT && (this._data = "", this._hitLimit = true));
            }
            unhook(e3) {
              let t3 = false;
              if (this._hitLimit) t3 = false;
              else if (e3 && (t3 = this._handler(this._data, this._params), t3 instanceof Promise)) return t3.then(((e4) => (this._params = a, this._data = "", this._hitLimit = false, e4)));
              return this._params = a, this._data = "", this._hitLimit = false, t3;
            }
          };
        }, 2015: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.EscapeSequenceParser = t2.VT500_TRANSITION_TABLE = t2.TransitionTable = void 0;
          const s2 = i9(844), r11 = i9(8742), n = i9(6242), o2 = i9(6351);
          class a {
            constructor(e3) {
              this.table = new Uint8Array(e3);
            }
            setDefault(e3, t3) {
              this.table.fill(e3 << 4 | t3);
            }
            add(e3, t3, i10, s3) {
              this.table[t3 << 8 | e3] = i10 << 4 | s3;
            }
            addMany(e3, t3, i10, s3) {
              for (let r12 = 0; r12 < e3.length; r12++) this.table[t3 << 8 | e3[r12]] = i10 << 4 | s3;
            }
          }
          t2.TransitionTable = a;
          const h2 = 160;
          t2.VT500_TRANSITION_TABLE = (function() {
            const e3 = new a(4095), t3 = Array.apply(null, Array(256)).map(((e4, t4) => t4)), i10 = (e4, i11) => t3.slice(e4, i11), s3 = i10(32, 127), r12 = i10(0, 24);
            r12.push(25), r12.push.apply(r12, i10(28, 32));
            const n2 = i10(0, 14);
            let o3;
            for (o3 in e3.setDefault(1, 0), e3.addMany(s3, 0, 2, 0), n2) e3.addMany([24, 26, 153, 154], o3, 3, 0), e3.addMany(i10(128, 144), o3, 3, 0), e3.addMany(i10(144, 152), o3, 3, 0), e3.add(156, o3, 0, 0), e3.add(27, o3, 11, 1), e3.add(157, o3, 4, 8), e3.addMany([152, 158, 159], o3, 0, 7), e3.add(155, o3, 11, 3), e3.add(144, o3, 11, 9);
            return e3.addMany(r12, 0, 3, 0), e3.addMany(r12, 1, 3, 1), e3.add(127, 1, 0, 1), e3.addMany(r12, 8, 0, 8), e3.addMany(r12, 3, 3, 3), e3.add(127, 3, 0, 3), e3.addMany(r12, 4, 3, 4), e3.add(127, 4, 0, 4), e3.addMany(r12, 6, 3, 6), e3.addMany(r12, 5, 3, 5), e3.add(127, 5, 0, 5), e3.addMany(r12, 2, 3, 2), e3.add(127, 2, 0, 2), e3.add(93, 1, 4, 8), e3.addMany(s3, 8, 5, 8), e3.add(127, 8, 5, 8), e3.addMany([156, 27, 24, 26, 7], 8, 6, 0), e3.addMany(i10(28, 32), 8, 0, 8), e3.addMany([88, 94, 95], 1, 0, 7), e3.addMany(s3, 7, 0, 7), e3.addMany(r12, 7, 0, 7), e3.add(156, 7, 0, 0), e3.add(127, 7, 0, 7), e3.add(91, 1, 11, 3), e3.addMany(i10(64, 127), 3, 7, 0), e3.addMany(i10(48, 60), 3, 8, 4), e3.addMany([60, 61, 62, 63], 3, 9, 4), e3.addMany(i10(48, 60), 4, 8, 4), e3.addMany(i10(64, 127), 4, 7, 0), e3.addMany([60, 61, 62, 63], 4, 0, 6), e3.addMany(i10(32, 64), 6, 0, 6), e3.add(127, 6, 0, 6), e3.addMany(i10(64, 127), 6, 0, 0), e3.addMany(i10(32, 48), 3, 9, 5), e3.addMany(i10(32, 48), 5, 9, 5), e3.addMany(i10(48, 64), 5, 0, 6), e3.addMany(i10(64, 127), 5, 7, 0), e3.addMany(i10(32, 48), 4, 9, 5), e3.addMany(i10(32, 48), 1, 9, 2), e3.addMany(i10(32, 48), 2, 9, 2), e3.addMany(i10(48, 127), 2, 10, 0), e3.addMany(i10(48, 80), 1, 10, 0), e3.addMany(i10(81, 88), 1, 10, 0), e3.addMany([89, 90, 92], 1, 10, 0), e3.addMany(i10(96, 127), 1, 10, 0), e3.add(80, 1, 11, 9), e3.addMany(r12, 9, 0, 9), e3.add(127, 9, 0, 9), e3.addMany(i10(28, 32), 9, 0, 9), e3.addMany(i10(32, 48), 9, 9, 12), e3.addMany(i10(48, 60), 9, 8, 10), e3.addMany([60, 61, 62, 63], 9, 9, 10), e3.addMany(r12, 11, 0, 11), e3.addMany(i10(32, 128), 11, 0, 11), e3.addMany(i10(28, 32), 11, 0, 11), e3.addMany(r12, 10, 0, 10), e3.add(127, 10, 0, 10), e3.addMany(i10(28, 32), 10, 0, 10), e3.addMany(i10(48, 60), 10, 8, 10), e3.addMany([60, 61, 62, 63], 10, 0, 11), e3.addMany(i10(32, 48), 10, 9, 12), e3.addMany(r12, 12, 0, 12), e3.add(127, 12, 0, 12), e3.addMany(i10(28, 32), 12, 0, 12), e3.addMany(i10(32, 48), 12, 9, 12), e3.addMany(i10(48, 64), 12, 0, 11), e3.addMany(i10(64, 127), 12, 12, 13), e3.addMany(i10(64, 127), 10, 12, 13), e3.addMany(i10(64, 127), 9, 12, 13), e3.addMany(r12, 13, 13, 13), e3.addMany(s3, 13, 13, 13), e3.add(127, 13, 0, 13), e3.addMany([27, 156, 24, 26], 13, 14, 0), e3.add(h2, 0, 2, 0), e3.add(h2, 8, 5, 8), e3.add(h2, 6, 0, 6), e3.add(h2, 11, 0, 11), e3.add(h2, 13, 13, 13), e3;
          })();
          class c extends s2.Disposable {
            constructor(e3 = t2.VT500_TRANSITION_TABLE) {
              super(), this._transitions = e3, this._parseStack = { state: 0, handlers: [], handlerPos: 0, transition: 0, chunkPos: 0 }, this.initialState = 0, this.currentState = this.initialState, this._params = new r11.Params(), this._params.addParam(0), this._collect = 0, this.precedingCodepoint = 0, this._printHandlerFb = (e4, t3, i10) => {
              }, this._executeHandlerFb = (e4) => {
              }, this._csiHandlerFb = (e4, t3) => {
              }, this._escHandlerFb = (e4) => {
              }, this._errorHandlerFb = (e4) => e4, this._printHandler = this._printHandlerFb, this._executeHandlers = /* @__PURE__ */ Object.create(null), this._csiHandlers = /* @__PURE__ */ Object.create(null), this._escHandlers = /* @__PURE__ */ Object.create(null), this.register((0, s2.toDisposable)((() => {
                this._csiHandlers = /* @__PURE__ */ Object.create(null), this._executeHandlers = /* @__PURE__ */ Object.create(null), this._escHandlers = /* @__PURE__ */ Object.create(null);
              }))), this._oscParser = this.register(new n.OscParser()), this._dcsParser = this.register(new o2.DcsParser()), this._errorHandler = this._errorHandlerFb, this.registerEscHandler({ final: "\\" }, (() => true));
            }
            _identifier(e3, t3 = [64, 126]) {
              let i10 = 0;
              if (e3.prefix) {
                if (e3.prefix.length > 1) throw new Error("only one byte as prefix supported");
                if (i10 = e3.prefix.charCodeAt(0), i10 && 60 > i10 || i10 > 63) throw new Error("prefix must be in range 0x3c .. 0x3f");
              }
              if (e3.intermediates) {
                if (e3.intermediates.length > 2) throw new Error("only two bytes as intermediates are supported");
                for (let t4 = 0; t4 < e3.intermediates.length; ++t4) {
                  const s4 = e3.intermediates.charCodeAt(t4);
                  if (32 > s4 || s4 > 47) throw new Error("intermediate must be in range 0x20 .. 0x2f");
                  i10 <<= 8, i10 |= s4;
                }
              }
              if (1 !== e3.final.length) throw new Error("final must be a single byte");
              const s3 = e3.final.charCodeAt(0);
              if (t3[0] > s3 || s3 > t3[1]) throw new Error(`final must be in range ${t3[0]} .. ${t3[1]}`);
              return i10 <<= 8, i10 |= s3, i10;
            }
            identToString(e3) {
              const t3 = [];
              for (; e3; ) t3.push(String.fromCharCode(255 & e3)), e3 >>= 8;
              return t3.reverse().join("");
            }
            setPrintHandler(e3) {
              this._printHandler = e3;
            }
            clearPrintHandler() {
              this._printHandler = this._printHandlerFb;
            }
            registerEscHandler(e3, t3) {
              const i10 = this._identifier(e3, [48, 126]);
              void 0 === this._escHandlers[i10] && (this._escHandlers[i10] = []);
              const s3 = this._escHandlers[i10];
              return s3.push(t3), { dispose: () => {
                const e4 = s3.indexOf(t3);
                -1 !== e4 && s3.splice(e4, 1);
              } };
            }
            clearEscHandler(e3) {
              this._escHandlers[this._identifier(e3, [48, 126])] && delete this._escHandlers[this._identifier(e3, [48, 126])];
            }
            setEscHandlerFallback(e3) {
              this._escHandlerFb = e3;
            }
            setExecuteHandler(e3, t3) {
              this._executeHandlers[e3.charCodeAt(0)] = t3;
            }
            clearExecuteHandler(e3) {
              this._executeHandlers[e3.charCodeAt(0)] && delete this._executeHandlers[e3.charCodeAt(0)];
            }
            setExecuteHandlerFallback(e3) {
              this._executeHandlerFb = e3;
            }
            registerCsiHandler(e3, t3) {
              const i10 = this._identifier(e3);
              void 0 === this._csiHandlers[i10] && (this._csiHandlers[i10] = []);
              const s3 = this._csiHandlers[i10];
              return s3.push(t3), { dispose: () => {
                const e4 = s3.indexOf(t3);
                -1 !== e4 && s3.splice(e4, 1);
              } };
            }
            clearCsiHandler(e3) {
              this._csiHandlers[this._identifier(e3)] && delete this._csiHandlers[this._identifier(e3)];
            }
            setCsiHandlerFallback(e3) {
              this._csiHandlerFb = e3;
            }
            registerDcsHandler(e3, t3) {
              return this._dcsParser.registerHandler(this._identifier(e3), t3);
            }
            clearDcsHandler(e3) {
              this._dcsParser.clearHandler(this._identifier(e3));
            }
            setDcsHandlerFallback(e3) {
              this._dcsParser.setHandlerFallback(e3);
            }
            registerOscHandler(e3, t3) {
              return this._oscParser.registerHandler(e3, t3);
            }
            clearOscHandler(e3) {
              this._oscParser.clearHandler(e3);
            }
            setOscHandlerFallback(e3) {
              this._oscParser.setHandlerFallback(e3);
            }
            setErrorHandler(e3) {
              this._errorHandler = e3;
            }
            clearErrorHandler() {
              this._errorHandler = this._errorHandlerFb;
            }
            reset() {
              this.currentState = this.initialState, this._oscParser.reset(), this._dcsParser.reset(), this._params.reset(), this._params.addParam(0), this._collect = 0, this.precedingCodepoint = 0, 0 !== this._parseStack.state && (this._parseStack.state = 2, this._parseStack.handlers = []);
            }
            _preserveStack(e3, t3, i10, s3, r12) {
              this._parseStack.state = e3, this._parseStack.handlers = t3, this._parseStack.handlerPos = i10, this._parseStack.transition = s3, this._parseStack.chunkPos = r12;
            }
            parse(e3, t3, i10) {
              let s3, r12 = 0, n2 = 0, o3 = 0;
              if (this._parseStack.state) if (2 === this._parseStack.state) this._parseStack.state = 0, o3 = this._parseStack.chunkPos + 1;
              else {
                if (void 0 === i10 || 1 === this._parseStack.state) throw this._parseStack.state = 1, new Error("improper continuation due to previous async handler, giving up parsing");
                const t4 = this._parseStack.handlers;
                let n3 = this._parseStack.handlerPos - 1;
                switch (this._parseStack.state) {
                  case 3:
                    if (false === i10 && n3 > -1) {
                      for (; n3 >= 0 && (s3 = t4[n3](this._params), true !== s3); n3--) if (s3 instanceof Promise) return this._parseStack.handlerPos = n3, s3;
                    }
                    this._parseStack.handlers = [];
                    break;
                  case 4:
                    if (false === i10 && n3 > -1) {
                      for (; n3 >= 0 && (s3 = t4[n3](), true !== s3); n3--) if (s3 instanceof Promise) return this._parseStack.handlerPos = n3, s3;
                    }
                    this._parseStack.handlers = [];
                    break;
                  case 6:
                    if (r12 = e3[this._parseStack.chunkPos], s3 = this._dcsParser.unhook(24 !== r12 && 26 !== r12, i10), s3) return s3;
                    27 === r12 && (this._parseStack.transition |= 1), this._params.reset(), this._params.addParam(0), this._collect = 0;
                    break;
                  case 5:
                    if (r12 = e3[this._parseStack.chunkPos], s3 = this._oscParser.end(24 !== r12 && 26 !== r12, i10), s3) return s3;
                    27 === r12 && (this._parseStack.transition |= 1), this._params.reset(), this._params.addParam(0), this._collect = 0;
                }
                this._parseStack.state = 0, o3 = this._parseStack.chunkPos + 1, this.precedingCodepoint = 0, this.currentState = 15 & this._parseStack.transition;
              }
              for (let i11 = o3; i11 < t3; ++i11) {
                switch (r12 = e3[i11], n2 = this._transitions.table[this.currentState << 8 | (r12 < 160 ? r12 : h2)], n2 >> 4) {
                  case 2:
                    for (let s4 = i11 + 1; ; ++s4) {
                      if (s4 >= t3 || (r12 = e3[s4]) < 32 || r12 > 126 && r12 < h2) {
                        this._printHandler(e3, i11, s4), i11 = s4 - 1;
                        break;
                      }
                      if (++s4 >= t3 || (r12 = e3[s4]) < 32 || r12 > 126 && r12 < h2) {
                        this._printHandler(e3, i11, s4), i11 = s4 - 1;
                        break;
                      }
                      if (++s4 >= t3 || (r12 = e3[s4]) < 32 || r12 > 126 && r12 < h2) {
                        this._printHandler(e3, i11, s4), i11 = s4 - 1;
                        break;
                      }
                      if (++s4 >= t3 || (r12 = e3[s4]) < 32 || r12 > 126 && r12 < h2) {
                        this._printHandler(e3, i11, s4), i11 = s4 - 1;
                        break;
                      }
                    }
                    break;
                  case 3:
                    this._executeHandlers[r12] ? this._executeHandlers[r12]() : this._executeHandlerFb(r12), this.precedingCodepoint = 0;
                    break;
                  case 0:
                    break;
                  case 1:
                    if (this._errorHandler({ position: i11, code: r12, currentState: this.currentState, collect: this._collect, params: this._params, abort: false }).abort) return;
                    break;
                  case 7:
                    const o4 = this._csiHandlers[this._collect << 8 | r12];
                    let a2 = o4 ? o4.length - 1 : -1;
                    for (; a2 >= 0 && (s3 = o4[a2](this._params), true !== s3); a2--) if (s3 instanceof Promise) return this._preserveStack(3, o4, a2, n2, i11), s3;
                    a2 < 0 && this._csiHandlerFb(this._collect << 8 | r12, this._params), this.precedingCodepoint = 0;
                    break;
                  case 8:
                    do {
                      switch (r12) {
                        case 59:
                          this._params.addParam(0);
                          break;
                        case 58:
                          this._params.addSubParam(-1);
                          break;
                        default:
                          this._params.addDigit(r12 - 48);
                      }
                    } while (++i11 < t3 && (r12 = e3[i11]) > 47 && r12 < 60);
                    i11--;
                    break;
                  case 9:
                    this._collect <<= 8, this._collect |= r12;
                    break;
                  case 10:
                    const c2 = this._escHandlers[this._collect << 8 | r12];
                    let l2 = c2 ? c2.length - 1 : -1;
                    for (; l2 >= 0 && (s3 = c2[l2](), true !== s3); l2--) if (s3 instanceof Promise) return this._preserveStack(4, c2, l2, n2, i11), s3;
                    l2 < 0 && this._escHandlerFb(this._collect << 8 | r12), this.precedingCodepoint = 0;
                    break;
                  case 11:
                    this._params.reset(), this._params.addParam(0), this._collect = 0;
                    break;
                  case 12:
                    this._dcsParser.hook(this._collect << 8 | r12, this._params);
                    break;
                  case 13:
                    for (let s4 = i11 + 1; ; ++s4) if (s4 >= t3 || 24 === (r12 = e3[s4]) || 26 === r12 || 27 === r12 || r12 > 127 && r12 < h2) {
                      this._dcsParser.put(e3, i11, s4), i11 = s4 - 1;
                      break;
                    }
                    break;
                  case 14:
                    if (s3 = this._dcsParser.unhook(24 !== r12 && 26 !== r12), s3) return this._preserveStack(6, [], 0, n2, i11), s3;
                    27 === r12 && (n2 |= 1), this._params.reset(), this._params.addParam(0), this._collect = 0, this.precedingCodepoint = 0;
                    break;
                  case 4:
                    this._oscParser.start();
                    break;
                  case 5:
                    for (let s4 = i11 + 1; ; s4++) if (s4 >= t3 || (r12 = e3[s4]) < 32 || r12 > 127 && r12 < h2) {
                      this._oscParser.put(e3, i11, s4), i11 = s4 - 1;
                      break;
                    }
                    break;
                  case 6:
                    if (s3 = this._oscParser.end(24 !== r12 && 26 !== r12), s3) return this._preserveStack(5, [], 0, n2, i11), s3;
                    27 === r12 && (n2 |= 1), this._params.reset(), this._params.addParam(0), this._collect = 0, this.precedingCodepoint = 0;
                }
                this.currentState = 15 & n2;
              }
            }
          }
          t2.EscapeSequenceParser = c;
        }, 6242: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.OscHandler = t2.OscParser = void 0;
          const s2 = i9(5770), r11 = i9(482), n = [];
          t2.OscParser = class {
            constructor() {
              this._state = 0, this._active = n, this._id = -1, this._handlers = /* @__PURE__ */ Object.create(null), this._handlerFb = () => {
              }, this._stack = { paused: false, loopPosition: 0, fallThrough: false };
            }
            registerHandler(e3, t3) {
              void 0 === this._handlers[e3] && (this._handlers[e3] = []);
              const i10 = this._handlers[e3];
              return i10.push(t3), { dispose: () => {
                const e4 = i10.indexOf(t3);
                -1 !== e4 && i10.splice(e4, 1);
              } };
            }
            clearHandler(e3) {
              this._handlers[e3] && delete this._handlers[e3];
            }
            setHandlerFallback(e3) {
              this._handlerFb = e3;
            }
            dispose() {
              this._handlers = /* @__PURE__ */ Object.create(null), this._handlerFb = () => {
              }, this._active = n;
            }
            reset() {
              if (2 === this._state) for (let e3 = this._stack.paused ? this._stack.loopPosition - 1 : this._active.length - 1; e3 >= 0; --e3) this._active[e3].end(false);
              this._stack.paused = false, this._active = n, this._id = -1, this._state = 0;
            }
            _start() {
              if (this._active = this._handlers[this._id] || n, this._active.length) for (let e3 = this._active.length - 1; e3 >= 0; e3--) this._active[e3].start();
              else this._handlerFb(this._id, "START");
            }
            _put(e3, t3, i10) {
              if (this._active.length) for (let s3 = this._active.length - 1; s3 >= 0; s3--) this._active[s3].put(e3, t3, i10);
              else this._handlerFb(this._id, "PUT", (0, r11.utf32ToString)(e3, t3, i10));
            }
            start() {
              this.reset(), this._state = 1;
            }
            put(e3, t3, i10) {
              if (3 !== this._state) {
                if (1 === this._state) for (; t3 < i10; ) {
                  const i11 = e3[t3++];
                  if (59 === i11) {
                    this._state = 2, this._start();
                    break;
                  }
                  if (i11 < 48 || 57 < i11) return void (this._state = 3);
                  -1 === this._id && (this._id = 0), this._id = 10 * this._id + i11 - 48;
                }
                2 === this._state && i10 - t3 > 0 && this._put(e3, t3, i10);
              }
            }
            end(e3, t3 = true) {
              if (0 !== this._state) {
                if (3 !== this._state) if (1 === this._state && this._start(), this._active.length) {
                  let i10 = false, s3 = this._active.length - 1, r12 = false;
                  if (this._stack.paused && (s3 = this._stack.loopPosition - 1, i10 = t3, r12 = this._stack.fallThrough, this._stack.paused = false), !r12 && false === i10) {
                    for (; s3 >= 0 && (i10 = this._active[s3].end(e3), true !== i10); s3--) if (i10 instanceof Promise) return this._stack.paused = true, this._stack.loopPosition = s3, this._stack.fallThrough = false, i10;
                    s3--;
                  }
                  for (; s3 >= 0; s3--) if (i10 = this._active[s3].end(false), i10 instanceof Promise) return this._stack.paused = true, this._stack.loopPosition = s3, this._stack.fallThrough = true, i10;
                } else this._handlerFb(this._id, "END", e3);
                this._active = n, this._id = -1, this._state = 0;
              }
            }
          }, t2.OscHandler = class {
            constructor(e3) {
              this._handler = e3, this._data = "", this._hitLimit = false;
            }
            start() {
              this._data = "", this._hitLimit = false;
            }
            put(e3, t3, i10) {
              this._hitLimit || (this._data += (0, r11.utf32ToString)(e3, t3, i10), this._data.length > s2.PAYLOAD_LIMIT && (this._data = "", this._hitLimit = true));
            }
            end(e3) {
              let t3 = false;
              if (this._hitLimit) t3 = false;
              else if (e3 && (t3 = this._handler(this._data), t3 instanceof Promise)) return t3.then(((e4) => (this._data = "", this._hitLimit = false, e4)));
              return this._data = "", this._hitLimit = false, t3;
            }
          };
        }, 8742: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.Params = void 0;
          const i9 = 2147483647;
          class s2 {
            static fromArray(e3) {
              const t3 = new s2();
              if (!e3.length) return t3;
              for (let i10 = Array.isArray(e3[0]) ? 1 : 0; i10 < e3.length; ++i10) {
                const s3 = e3[i10];
                if (Array.isArray(s3)) for (let e4 = 0; e4 < s3.length; ++e4) t3.addSubParam(s3[e4]);
                else t3.addParam(s3);
              }
              return t3;
            }
            constructor(e3 = 32, t3 = 32) {
              if (this.maxLength = e3, this.maxSubParamsLength = t3, t3 > 256) throw new Error("maxSubParamsLength must not be greater than 256");
              this.params = new Int32Array(e3), this.length = 0, this._subParams = new Int32Array(t3), this._subParamsLength = 0, this._subParamsIdx = new Uint16Array(e3), this._rejectDigits = false, this._rejectSubDigits = false, this._digitIsSub = false;
            }
            clone() {
              const e3 = new s2(this.maxLength, this.maxSubParamsLength);
              return e3.params.set(this.params), e3.length = this.length, e3._subParams.set(this._subParams), e3._subParamsLength = this._subParamsLength, e3._subParamsIdx.set(this._subParamsIdx), e3._rejectDigits = this._rejectDigits, e3._rejectSubDigits = this._rejectSubDigits, e3._digitIsSub = this._digitIsSub, e3;
            }
            toArray() {
              const e3 = [];
              for (let t3 = 0; t3 < this.length; ++t3) {
                e3.push(this.params[t3]);
                const i10 = this._subParamsIdx[t3] >> 8, s3 = 255 & this._subParamsIdx[t3];
                s3 - i10 > 0 && e3.push(Array.prototype.slice.call(this._subParams, i10, s3));
              }
              return e3;
            }
            reset() {
              this.length = 0, this._subParamsLength = 0, this._rejectDigits = false, this._rejectSubDigits = false, this._digitIsSub = false;
            }
            addParam(e3) {
              if (this._digitIsSub = false, this.length >= this.maxLength) this._rejectDigits = true;
              else {
                if (e3 < -1) throw new Error("values lesser than -1 are not allowed");
                this._subParamsIdx[this.length] = this._subParamsLength << 8 | this._subParamsLength, this.params[this.length++] = e3 > i9 ? i9 : e3;
              }
            }
            addSubParam(e3) {
              if (this._digitIsSub = true, this.length) if (this._rejectDigits || this._subParamsLength >= this.maxSubParamsLength) this._rejectSubDigits = true;
              else {
                if (e3 < -1) throw new Error("values lesser than -1 are not allowed");
                this._subParams[this._subParamsLength++] = e3 > i9 ? i9 : e3, this._subParamsIdx[this.length - 1]++;
              }
            }
            hasSubParams(e3) {
              return (255 & this._subParamsIdx[e3]) - (this._subParamsIdx[e3] >> 8) > 0;
            }
            getSubParams(e3) {
              const t3 = this._subParamsIdx[e3] >> 8, i10 = 255 & this._subParamsIdx[e3];
              return i10 - t3 > 0 ? this._subParams.subarray(t3, i10) : null;
            }
            getSubParamsAll() {
              const e3 = {};
              for (let t3 = 0; t3 < this.length; ++t3) {
                const i10 = this._subParamsIdx[t3] >> 8, s3 = 255 & this._subParamsIdx[t3];
                s3 - i10 > 0 && (e3[t3] = this._subParams.slice(i10, s3));
              }
              return e3;
            }
            addDigit(e3) {
              let t3;
              if (this._rejectDigits || !(t3 = this._digitIsSub ? this._subParamsLength : this.length) || this._digitIsSub && this._rejectSubDigits) return;
              const s3 = this._digitIsSub ? this._subParams : this.params, r11 = s3[t3 - 1];
              s3[t3 - 1] = ~r11 ? Math.min(10 * r11 + e3, i9) : e3;
            }
          }
          t2.Params = s2;
        }, 5741: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.AddonManager = void 0, t2.AddonManager = class {
            constructor() {
              this._addons = [];
            }
            dispose() {
              for (let e3 = this._addons.length - 1; e3 >= 0; e3--) this._addons[e3].instance.dispose();
            }
            loadAddon(e3, t3) {
              const i9 = { instance: t3, dispose: t3.dispose, isDisposed: false };
              this._addons.push(i9), t3.dispose = () => this._wrappedAddonDispose(i9), t3.activate(e3);
            }
            _wrappedAddonDispose(e3) {
              if (e3.isDisposed) return;
              let t3 = -1;
              for (let i9 = 0; i9 < this._addons.length; i9++) if (this._addons[i9] === e3) {
                t3 = i9;
                break;
              }
              if (-1 === t3) throw new Error("Could not dispose an addon that has not been loaded");
              e3.isDisposed = true, e3.dispose.apply(e3.instance), this._addons.splice(t3, 1);
            }
          };
        }, 8771: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.BufferApiView = void 0;
          const s2 = i9(3785), r11 = i9(511);
          t2.BufferApiView = class {
            constructor(e3, t3) {
              this._buffer = e3, this.type = t3;
            }
            init(e3) {
              return this._buffer = e3, this;
            }
            get cursorY() {
              return this._buffer.y;
            }
            get cursorX() {
              return this._buffer.x;
            }
            get viewportY() {
              return this._buffer.ydisp;
            }
            get baseY() {
              return this._buffer.ybase;
            }
            get length() {
              return this._buffer.lines.length;
            }
            getLine(e3) {
              const t3 = this._buffer.lines.get(e3);
              if (t3) return new s2.BufferLineApiView(t3);
            }
            getNullCell() {
              return new r11.CellData();
            }
          };
        }, 3785: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.BufferLineApiView = void 0;
          const s2 = i9(511);
          t2.BufferLineApiView = class {
            constructor(e3) {
              this._line = e3;
            }
            get isWrapped() {
              return this._line.isWrapped;
            }
            get length() {
              return this._line.length;
            }
            getCell(e3, t3) {
              if (!(e3 < 0 || e3 >= this._line.length)) return t3 ? (this._line.loadCell(e3, t3), t3) : this._line.loadCell(e3, new s2.CellData());
            }
            translateToString(e3, t3, i10) {
              return this._line.translateToString(e3, t3, i10);
            }
          };
        }, 8285: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.BufferNamespaceApi = void 0;
          const s2 = i9(8771), r11 = i9(8460), n = i9(844);
          class o2 extends n.Disposable {
            constructor(e3) {
              super(), this._core = e3, this._onBufferChange = this.register(new r11.EventEmitter()), this.onBufferChange = this._onBufferChange.event, this._normal = new s2.BufferApiView(this._core.buffers.normal, "normal"), this._alternate = new s2.BufferApiView(this._core.buffers.alt, "alternate"), this._core.buffers.onBufferActivate((() => this._onBufferChange.fire(this.active)));
            }
            get active() {
              if (this._core.buffers.active === this._core.buffers.normal) return this.normal;
              if (this._core.buffers.active === this._core.buffers.alt) return this.alternate;
              throw new Error("Active buffer is neither normal nor alternate");
            }
            get normal() {
              return this._normal.init(this._core.buffers.normal);
            }
            get alternate() {
              return this._alternate.init(this._core.buffers.alt);
            }
          }
          t2.BufferNamespaceApi = o2;
        }, 7975: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.ParserApi = void 0, t2.ParserApi = class {
            constructor(e3) {
              this._core = e3;
            }
            registerCsiHandler(e3, t3) {
              return this._core.registerCsiHandler(e3, ((e4) => t3(e4.toArray())));
            }
            addCsiHandler(e3, t3) {
              return this.registerCsiHandler(e3, t3);
            }
            registerDcsHandler(e3, t3) {
              return this._core.registerDcsHandler(e3, ((e4, i9) => t3(e4, i9.toArray())));
            }
            addDcsHandler(e3, t3) {
              return this.registerDcsHandler(e3, t3);
            }
            registerEscHandler(e3, t3) {
              return this._core.registerEscHandler(e3, t3);
            }
            addEscHandler(e3, t3) {
              return this.registerEscHandler(e3, t3);
            }
            registerOscHandler(e3, t3) {
              return this._core.registerOscHandler(e3, t3);
            }
            addOscHandler(e3, t3) {
              return this.registerOscHandler(e3, t3);
            }
          };
        }, 7090: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.UnicodeApi = void 0, t2.UnicodeApi = class {
            constructor(e3) {
              this._core = e3;
            }
            register(e3) {
              this._core.unicodeService.register(e3);
            }
            get versions() {
              return this._core.unicodeService.versions;
            }
            get activeVersion() {
              return this._core.unicodeService.activeVersion;
            }
            set activeVersion(e3) {
              this._core.unicodeService.activeVersion = e3;
            }
          };
        }, 744: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.BufferService = t2.MINIMUM_ROWS = t2.MINIMUM_COLS = void 0;
          const n = i9(8460), o2 = i9(844), a = i9(5295), h2 = i9(2585);
          t2.MINIMUM_COLS = 2, t2.MINIMUM_ROWS = 1;
          let c = t2.BufferService = class extends o2.Disposable {
            get buffer() {
              return this.buffers.active;
            }
            constructor(e3) {
              super(), this.isUserScrolling = false, this._onResize = this.register(new n.EventEmitter()), this.onResize = this._onResize.event, this._onScroll = this.register(new n.EventEmitter()), this.onScroll = this._onScroll.event, this.cols = Math.max(e3.rawOptions.cols || 0, t2.MINIMUM_COLS), this.rows = Math.max(e3.rawOptions.rows || 0, t2.MINIMUM_ROWS), this.buffers = this.register(new a.BufferSet(e3, this));
            }
            resize(e3, t3) {
              this.cols = e3, this.rows = t3, this.buffers.resize(e3, t3), this._onResize.fire({ cols: e3, rows: t3 });
            }
            reset() {
              this.buffers.reset(), this.isUserScrolling = false;
            }
            scroll(e3, t3 = false) {
              const i10 = this.buffer;
              let s3;
              s3 = this._cachedBlankLine, s3 && s3.length === this.cols && s3.getFg(0) === e3.fg && s3.getBg(0) === e3.bg || (s3 = i10.getBlankLine(e3, t3), this._cachedBlankLine = s3), s3.isWrapped = t3;
              const r12 = i10.ybase + i10.scrollTop, n2 = i10.ybase + i10.scrollBottom;
              if (0 === i10.scrollTop) {
                const e4 = i10.lines.isFull;
                n2 === i10.lines.length - 1 ? e4 ? i10.lines.recycle().copyFrom(s3) : i10.lines.push(s3.clone()) : i10.lines.splice(n2 + 1, 0, s3.clone()), e4 ? this.isUserScrolling && (i10.ydisp = Math.max(i10.ydisp - 1, 0)) : (i10.ybase++, this.isUserScrolling || i10.ydisp++);
              } else {
                const e4 = n2 - r12 + 1;
                i10.lines.shiftElements(r12 + 1, e4 - 1, -1), i10.lines.set(n2, s3.clone());
              }
              this.isUserScrolling || (i10.ydisp = i10.ybase), this._onScroll.fire(i10.ydisp);
            }
            scrollLines(e3, t3, i10) {
              const s3 = this.buffer;
              if (e3 < 0) {
                if (0 === s3.ydisp) return;
                this.isUserScrolling = true;
              } else e3 + s3.ydisp >= s3.ybase && (this.isUserScrolling = false);
              const r12 = s3.ydisp;
              s3.ydisp = Math.max(Math.min(s3.ydisp + e3, s3.ybase), 0), r12 !== s3.ydisp && (t3 || this._onScroll.fire(s3.ydisp));
            }
          };
          t2.BufferService = c = s2([r11(0, h2.IOptionsService)], c);
        }, 7994: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.CharsetService = void 0, t2.CharsetService = class {
            constructor() {
              this.glevel = 0, this._charsets = [];
            }
            reset() {
              this.charset = void 0, this._charsets = [], this.glevel = 0;
            }
            setgLevel(e3) {
              this.glevel = e3, this.charset = this._charsets[e3];
            }
            setgCharset(e3, t3) {
              this._charsets[e3] = t3, this.glevel === e3 && (this.charset = t3);
            }
          };
        }, 1753: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.CoreMouseService = void 0;
          const n = i9(2585), o2 = i9(8460), a = i9(844), h2 = { NONE: { events: 0, restrict: () => false }, X10: { events: 1, restrict: (e3) => 4 !== e3.button && 1 === e3.action && (e3.ctrl = false, e3.alt = false, e3.shift = false, true) }, VT200: { events: 19, restrict: (e3) => 32 !== e3.action }, DRAG: { events: 23, restrict: (e3) => 32 !== e3.action || 3 !== e3.button }, ANY: { events: 31, restrict: (e3) => true } };
          function c(e3, t3) {
            let i10 = (e3.ctrl ? 16 : 0) | (e3.shift ? 4 : 0) | (e3.alt ? 8 : 0);
            return 4 === e3.button ? (i10 |= 64, i10 |= e3.action) : (i10 |= 3 & e3.button, 4 & e3.button && (i10 |= 64), 8 & e3.button && (i10 |= 128), 32 === e3.action ? i10 |= 32 : 0 !== e3.action || t3 || (i10 |= 3)), i10;
          }
          const l2 = String.fromCharCode, d = { DEFAULT: (e3) => {
            const t3 = [c(e3, false) + 32, e3.col + 32, e3.row + 32];
            return t3[0] > 255 || t3[1] > 255 || t3[2] > 255 ? "" : `\x1B[M${l2(t3[0])}${l2(t3[1])}${l2(t3[2])}`;
          }, SGR: (e3) => {
            const t3 = 0 === e3.action && 4 !== e3.button ? "m" : "M";
            return `\x1B[<${c(e3, true)};${e3.col};${e3.row}${t3}`;
          }, SGR_PIXELS: (e3) => {
            const t3 = 0 === e3.action && 4 !== e3.button ? "m" : "M";
            return `\x1B[<${c(e3, true)};${e3.x};${e3.y}${t3}`;
          } };
          let _4 = t2.CoreMouseService = class extends a.Disposable {
            constructor(e3, t3) {
              super(), this._bufferService = e3, this._coreService = t3, this._protocols = {}, this._encodings = {}, this._activeProtocol = "", this._activeEncoding = "", this._lastEvent = null, this._onProtocolChange = this.register(new o2.EventEmitter()), this.onProtocolChange = this._onProtocolChange.event;
              for (const e4 of Object.keys(h2)) this.addProtocol(e4, h2[e4]);
              for (const e4 of Object.keys(d)) this.addEncoding(e4, d[e4]);
              this.reset();
            }
            addProtocol(e3, t3) {
              this._protocols[e3] = t3;
            }
            addEncoding(e3, t3) {
              this._encodings[e3] = t3;
            }
            get activeProtocol() {
              return this._activeProtocol;
            }
            get areMouseEventsActive() {
              return 0 !== this._protocols[this._activeProtocol].events;
            }
            set activeProtocol(e3) {
              if (!this._protocols[e3]) throw new Error(`unknown protocol "${e3}"`);
              this._activeProtocol = e3, this._onProtocolChange.fire(this._protocols[e3].events);
            }
            get activeEncoding() {
              return this._activeEncoding;
            }
            set activeEncoding(e3) {
              if (!this._encodings[e3]) throw new Error(`unknown encoding "${e3}"`);
              this._activeEncoding = e3;
            }
            reset() {
              this.activeProtocol = "NONE", this.activeEncoding = "DEFAULT", this._lastEvent = null;
            }
            triggerMouseEvent(e3) {
              if (e3.col < 0 || e3.col >= this._bufferService.cols || e3.row < 0 || e3.row >= this._bufferService.rows) return false;
              if (4 === e3.button && 32 === e3.action) return false;
              if (3 === e3.button && 32 !== e3.action) return false;
              if (4 !== e3.button && (2 === e3.action || 3 === e3.action)) return false;
              if (e3.col++, e3.row++, 32 === e3.action && this._lastEvent && this._equalEvents(this._lastEvent, e3, "SGR_PIXELS" === this._activeEncoding)) return false;
              if (!this._protocols[this._activeProtocol].restrict(e3)) return false;
              const t3 = this._encodings[this._activeEncoding](e3);
              return t3 && ("DEFAULT" === this._activeEncoding ? this._coreService.triggerBinaryEvent(t3) : this._coreService.triggerDataEvent(t3, true)), this._lastEvent = e3, true;
            }
            explainEvents(e3) {
              return { down: !!(1 & e3), up: !!(2 & e3), drag: !!(4 & e3), move: !!(8 & e3), wheel: !!(16 & e3) };
            }
            _equalEvents(e3, t3, i10) {
              if (i10) {
                if (e3.x !== t3.x) return false;
                if (e3.y !== t3.y) return false;
              } else {
                if (e3.col !== t3.col) return false;
                if (e3.row !== t3.row) return false;
              }
              return e3.button === t3.button && e3.action === t3.action && e3.ctrl === t3.ctrl && e3.alt === t3.alt && e3.shift === t3.shift;
            }
          };
          t2.CoreMouseService = _4 = s2([r11(0, n.IBufferService), r11(1, n.ICoreService)], _4);
        }, 6975: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.CoreService = void 0;
          const n = i9(1439), o2 = i9(8460), a = i9(844), h2 = i9(2585), c = Object.freeze({ insertMode: false }), l2 = Object.freeze({ applicationCursorKeys: false, applicationKeypad: false, bracketedPasteMode: false, origin: false, reverseWraparound: false, sendFocus: false, wraparound: true });
          let d = t2.CoreService = class extends a.Disposable {
            constructor(e3, t3, i10) {
              super(), this._bufferService = e3, this._logService = t3, this._optionsService = i10, this.isCursorInitialized = false, this.isCursorHidden = false, this._onData = this.register(new o2.EventEmitter()), this.onData = this._onData.event, this._onUserInput = this.register(new o2.EventEmitter()), this.onUserInput = this._onUserInput.event, this._onBinary = this.register(new o2.EventEmitter()), this.onBinary = this._onBinary.event, this._onRequestScrollToBottom = this.register(new o2.EventEmitter()), this.onRequestScrollToBottom = this._onRequestScrollToBottom.event, this.modes = (0, n.clone)(c), this.decPrivateModes = (0, n.clone)(l2);
            }
            reset() {
              this.modes = (0, n.clone)(c), this.decPrivateModes = (0, n.clone)(l2);
            }
            triggerDataEvent(e3, t3 = false) {
              if (this._optionsService.rawOptions.disableStdin) return;
              const i10 = this._bufferService.buffer;
              t3 && this._optionsService.rawOptions.scrollOnUserInput && i10.ybase !== i10.ydisp && this._onRequestScrollToBottom.fire(), t3 && this._onUserInput.fire(), this._logService.debug(`sending data "${e3}"`, (() => e3.split("").map(((e4) => e4.charCodeAt(0))))), this._onData.fire(e3);
            }
            triggerBinaryEvent(e3) {
              this._optionsService.rawOptions.disableStdin || (this._logService.debug(`sending binary "${e3}"`, (() => e3.split("").map(((e4) => e4.charCodeAt(0))))), this._onBinary.fire(e3));
            }
          };
          t2.CoreService = d = s2([r11(0, h2.IBufferService), r11(1, h2.ILogService), r11(2, h2.IOptionsService)], d);
        }, 9074: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.DecorationService = void 0;
          const s2 = i9(8055), r11 = i9(8460), n = i9(844), o2 = i9(6106);
          let a = 0, h2 = 0;
          class c extends n.Disposable {
            get decorations() {
              return this._decorations.values();
            }
            constructor() {
              super(), this._decorations = new o2.SortedList(((e3) => null == e3 ? void 0 : e3.marker.line)), this._onDecorationRegistered = this.register(new r11.EventEmitter()), this.onDecorationRegistered = this._onDecorationRegistered.event, this._onDecorationRemoved = this.register(new r11.EventEmitter()), this.onDecorationRemoved = this._onDecorationRemoved.event, this.register((0, n.toDisposable)((() => this.reset())));
            }
            registerDecoration(e3) {
              if (e3.marker.isDisposed) return;
              const t3 = new l2(e3);
              if (t3) {
                const e4 = t3.marker.onDispose((() => t3.dispose()));
                t3.onDispose((() => {
                  t3 && (this._decorations.delete(t3) && this._onDecorationRemoved.fire(t3), e4.dispose());
                })), this._decorations.insert(t3), this._onDecorationRegistered.fire(t3);
              }
              return t3;
            }
            reset() {
              for (const e3 of this._decorations.values()) e3.dispose();
              this._decorations.clear();
            }
            *getDecorationsAtCell(e3, t3, i10) {
              var s3, r12, n2;
              let o3 = 0, a2 = 0;
              for (const h3 of this._decorations.getKeyIterator(t3)) o3 = null !== (s3 = h3.options.x) && void 0 !== s3 ? s3 : 0, a2 = o3 + (null !== (r12 = h3.options.width) && void 0 !== r12 ? r12 : 1), e3 >= o3 && e3 < a2 && (!i10 || (null !== (n2 = h3.options.layer) && void 0 !== n2 ? n2 : "bottom") === i10) && (yield h3);
            }
            forEachDecorationAtCell(e3, t3, i10, s3) {
              this._decorations.forEachByKey(t3, ((t4) => {
                var r12, n2, o3;
                a = null !== (r12 = t4.options.x) && void 0 !== r12 ? r12 : 0, h2 = a + (null !== (n2 = t4.options.width) && void 0 !== n2 ? n2 : 1), e3 >= a && e3 < h2 && (!i10 || (null !== (o3 = t4.options.layer) && void 0 !== o3 ? o3 : "bottom") === i10) && s3(t4);
              }));
            }
          }
          t2.DecorationService = c;
          class l2 extends n.Disposable {
            get isDisposed() {
              return this._isDisposed;
            }
            get backgroundColorRGB() {
              return null === this._cachedBg && (this.options.backgroundColor ? this._cachedBg = s2.css.toColor(this.options.backgroundColor) : this._cachedBg = void 0), this._cachedBg;
            }
            get foregroundColorRGB() {
              return null === this._cachedFg && (this.options.foregroundColor ? this._cachedFg = s2.css.toColor(this.options.foregroundColor) : this._cachedFg = void 0), this._cachedFg;
            }
            constructor(e3) {
              super(), this.options = e3, this.onRenderEmitter = this.register(new r11.EventEmitter()), this.onRender = this.onRenderEmitter.event, this._onDispose = this.register(new r11.EventEmitter()), this.onDispose = this._onDispose.event, this._cachedBg = null, this._cachedFg = null, this.marker = e3.marker, this.options.overviewRulerOptions && !this.options.overviewRulerOptions.position && (this.options.overviewRulerOptions.position = "full");
            }
            dispose() {
              this._onDispose.fire(), super.dispose();
            }
          }
        }, 4348: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.InstantiationService = t2.ServiceCollection = void 0;
          const s2 = i9(2585), r11 = i9(8343);
          class n {
            constructor(...e3) {
              this._entries = /* @__PURE__ */ new Map();
              for (const [t3, i10] of e3) this.set(t3, i10);
            }
            set(e3, t3) {
              const i10 = this._entries.get(e3);
              return this._entries.set(e3, t3), i10;
            }
            forEach(e3) {
              for (const [t3, i10] of this._entries.entries()) e3(t3, i10);
            }
            has(e3) {
              return this._entries.has(e3);
            }
            get(e3) {
              return this._entries.get(e3);
            }
          }
          t2.ServiceCollection = n, t2.InstantiationService = class {
            constructor() {
              this._services = new n(), this._services.set(s2.IInstantiationService, this);
            }
            setService(e3, t3) {
              this._services.set(e3, t3);
            }
            getService(e3) {
              return this._services.get(e3);
            }
            createInstance(e3, ...t3) {
              const i10 = (0, r11.getServiceDependencies)(e3).sort(((e4, t4) => e4.index - t4.index)), s3 = [];
              for (const t4 of i10) {
                const i11 = this._services.get(t4.id);
                if (!i11) throw new Error(`[createInstance] ${e3.name} depends on UNKNOWN service ${t4.id}.`);
                s3.push(i11);
              }
              const n2 = i10.length > 0 ? i10[0].index : t3.length;
              if (t3.length !== n2) throw new Error(`[createInstance] First service dependency of ${e3.name} at position ${n2 + 1} conflicts with ${t3.length} static arguments`);
              return new e3(...[...t3, ...s3]);
            }
          };
        }, 7866: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a2 = e3.length - 1; a2 >= 0; a2--) (r12 = e3[a2]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.traceCall = t2.setTraceLogger = t2.LogService = void 0;
          const n = i9(844), o2 = i9(2585), a = { trace: o2.LogLevelEnum.TRACE, debug: o2.LogLevelEnum.DEBUG, info: o2.LogLevelEnum.INFO, warn: o2.LogLevelEnum.WARN, error: o2.LogLevelEnum.ERROR, off: o2.LogLevelEnum.OFF };
          let h2, c = t2.LogService = class extends n.Disposable {
            get logLevel() {
              return this._logLevel;
            }
            constructor(e3) {
              super(), this._optionsService = e3, this._logLevel = o2.LogLevelEnum.OFF, this._updateLogLevel(), this.register(this._optionsService.onSpecificOptionChange("logLevel", (() => this._updateLogLevel()))), h2 = this;
            }
            _updateLogLevel() {
              this._logLevel = a[this._optionsService.rawOptions.logLevel];
            }
            _evalLazyOptionalParams(e3) {
              for (let t3 = 0; t3 < e3.length; t3++) "function" == typeof e3[t3] && (e3[t3] = e3[t3]());
            }
            _log(e3, t3, i10) {
              this._evalLazyOptionalParams(i10), e3.call(console, (this._optionsService.options.logger ? "" : "xterm.js: ") + t3, ...i10);
            }
            trace(e3, ...t3) {
              var i10, s3;
              this._logLevel <= o2.LogLevelEnum.TRACE && this._log(null !== (s3 = null === (i10 = this._optionsService.options.logger) || void 0 === i10 ? void 0 : i10.trace.bind(this._optionsService.options.logger)) && void 0 !== s3 ? s3 : console.log, e3, t3);
            }
            debug(e3, ...t3) {
              var i10, s3;
              this._logLevel <= o2.LogLevelEnum.DEBUG && this._log(null !== (s3 = null === (i10 = this._optionsService.options.logger) || void 0 === i10 ? void 0 : i10.debug.bind(this._optionsService.options.logger)) && void 0 !== s3 ? s3 : console.log, e3, t3);
            }
            info(e3, ...t3) {
              var i10, s3;
              this._logLevel <= o2.LogLevelEnum.INFO && this._log(null !== (s3 = null === (i10 = this._optionsService.options.logger) || void 0 === i10 ? void 0 : i10.info.bind(this._optionsService.options.logger)) && void 0 !== s3 ? s3 : console.info, e3, t3);
            }
            warn(e3, ...t3) {
              var i10, s3;
              this._logLevel <= o2.LogLevelEnum.WARN && this._log(null !== (s3 = null === (i10 = this._optionsService.options.logger) || void 0 === i10 ? void 0 : i10.warn.bind(this._optionsService.options.logger)) && void 0 !== s3 ? s3 : console.warn, e3, t3);
            }
            error(e3, ...t3) {
              var i10, s3;
              this._logLevel <= o2.LogLevelEnum.ERROR && this._log(null !== (s3 = null === (i10 = this._optionsService.options.logger) || void 0 === i10 ? void 0 : i10.error.bind(this._optionsService.options.logger)) && void 0 !== s3 ? s3 : console.error, e3, t3);
            }
          };
          t2.LogService = c = s2([r11(0, o2.IOptionsService)], c), t2.setTraceLogger = function(e3) {
            h2 = e3;
          }, t2.traceCall = function(e3, t3, i10) {
            if ("function" != typeof i10.value) throw new Error("not supported");
            const s3 = i10.value;
            i10.value = function(...e4) {
              if (h2.logLevel !== o2.LogLevelEnum.TRACE) return s3.apply(this, e4);
              h2.trace(`GlyphRenderer#${s3.name}(${e4.map(((e5) => JSON.stringify(e5))).join(", ")})`);
              const t4 = s3.apply(this, e4);
              return h2.trace(`GlyphRenderer#${s3.name} return`, t4), t4;
            };
          };
        }, 7302: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.OptionsService = t2.DEFAULT_OPTIONS = void 0;
          const s2 = i9(8460), r11 = i9(844), n = i9(6114);
          t2.DEFAULT_OPTIONS = { cols: 80, rows: 24, cursorBlink: false, cursorStyle: "block", cursorWidth: 1, cursorInactiveStyle: "outline", customGlyphs: true, drawBoldTextInBrightColors: true, fastScrollModifier: "alt", fastScrollSensitivity: 5, fontFamily: "courier-new, courier, monospace", fontSize: 15, fontWeight: "normal", fontWeightBold: "bold", ignoreBracketedPasteMode: false, lineHeight: 1, letterSpacing: 0, linkHandler: null, logLevel: "info", logger: null, scrollback: 1e3, scrollOnUserInput: true, scrollSensitivity: 1, screenReaderMode: false, smoothScrollDuration: 0, macOptionIsMeta: false, macOptionClickForcesSelection: false, minimumContrastRatio: 1, disableStdin: false, allowProposedApi: false, allowTransparency: false, tabStopWidth: 8, theme: {}, rightClickSelectsWord: n.isMac, windowOptions: {}, windowsMode: false, windowsPty: {}, wordSeparator: " ()[]{}',\"`", altClickMovesCursor: true, convertEol: false, termName: "xterm", cancelEvents: false, overviewRulerWidth: 0 };
          const o2 = ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
          class a extends r11.Disposable {
            constructor(e3) {
              super(), this._onOptionChange = this.register(new s2.EventEmitter()), this.onOptionChange = this._onOptionChange.event;
              const i10 = Object.assign({}, t2.DEFAULT_OPTIONS);
              for (const t3 in e3) if (t3 in i10) try {
                const s3 = e3[t3];
                i10[t3] = this._sanitizeAndValidateOption(t3, s3);
              } catch (e4) {
                console.error(e4);
              }
              this.rawOptions = i10, this.options = Object.assign({}, i10), this._setupOptions();
            }
            onSpecificOptionChange(e3, t3) {
              return this.onOptionChange(((i10) => {
                i10 === e3 && t3(this.rawOptions[e3]);
              }));
            }
            onMultipleOptionChange(e3, t3) {
              return this.onOptionChange(((i10) => {
                -1 !== e3.indexOf(i10) && t3();
              }));
            }
            _setupOptions() {
              const e3 = (e4) => {
                if (!(e4 in t2.DEFAULT_OPTIONS)) throw new Error(`No option with key "${e4}"`);
                return this.rawOptions[e4];
              }, i10 = (e4, i11) => {
                if (!(e4 in t2.DEFAULT_OPTIONS)) throw new Error(`No option with key "${e4}"`);
                i11 = this._sanitizeAndValidateOption(e4, i11), this.rawOptions[e4] !== i11 && (this.rawOptions[e4] = i11, this._onOptionChange.fire(e4));
              };
              for (const t3 in this.rawOptions) {
                const s3 = { get: e3.bind(this, t3), set: i10.bind(this, t3) };
                Object.defineProperty(this.options, t3, s3);
              }
            }
            _sanitizeAndValidateOption(e3, i10) {
              switch (e3) {
                case "cursorStyle":
                  if (i10 || (i10 = t2.DEFAULT_OPTIONS[e3]), !/* @__PURE__ */ (function(e4) {
                    return "block" === e4 || "underline" === e4 || "bar" === e4;
                  })(i10)) throw new Error(`"${i10}" is not a valid value for ${e3}`);
                  break;
                case "wordSeparator":
                  i10 || (i10 = t2.DEFAULT_OPTIONS[e3]);
                  break;
                case "fontWeight":
                case "fontWeightBold":
                  if ("number" == typeof i10 && 1 <= i10 && i10 <= 1e3) break;
                  i10 = o2.includes(i10) ? i10 : t2.DEFAULT_OPTIONS[e3];
                  break;
                case "cursorWidth":
                  i10 = Math.floor(i10);
                case "lineHeight":
                case "tabStopWidth":
                  if (i10 < 1) throw new Error(`${e3} cannot be less than 1, value: ${i10}`);
                  break;
                case "minimumContrastRatio":
                  i10 = Math.max(1, Math.min(21, Math.round(10 * i10) / 10));
                  break;
                case "scrollback":
                  if ((i10 = Math.min(i10, 4294967295)) < 0) throw new Error(`${e3} cannot be less than 0, value: ${i10}`);
                  break;
                case "fastScrollSensitivity":
                case "scrollSensitivity":
                  if (i10 <= 0) throw new Error(`${e3} cannot be less than or equal to 0, value: ${i10}`);
                  break;
                case "rows":
                case "cols":
                  if (!i10 && 0 !== i10) throw new Error(`${e3} must be numeric, value: ${i10}`);
                  break;
                case "windowsPty":
                  i10 = null != i10 ? i10 : {};
              }
              return i10;
            }
          }
          t2.OptionsService = a;
        }, 2660: function(e2, t2, i9) {
          var s2 = this && this.__decorate || function(e3, t3, i10, s3) {
            var r12, n2 = arguments.length, o3 = n2 < 3 ? t3 : null === s3 ? s3 = Object.getOwnPropertyDescriptor(t3, i10) : s3;
            if ("object" == typeof Reflect && "function" == typeof Reflect.decorate) o3 = Reflect.decorate(e3, t3, i10, s3);
            else for (var a = e3.length - 1; a >= 0; a--) (r12 = e3[a]) && (o3 = (n2 < 3 ? r12(o3) : n2 > 3 ? r12(t3, i10, o3) : r12(t3, i10)) || o3);
            return n2 > 3 && o3 && Object.defineProperty(t3, i10, o3), o3;
          }, r11 = this && this.__param || function(e3, t3) {
            return function(i10, s3) {
              t3(i10, s3, e3);
            };
          };
          Object.defineProperty(t2, "__esModule", { value: true }), t2.OscLinkService = void 0;
          const n = i9(2585);
          let o2 = t2.OscLinkService = class {
            constructor(e3) {
              this._bufferService = e3, this._nextId = 1, this._entriesWithId = /* @__PURE__ */ new Map(), this._dataByLinkId = /* @__PURE__ */ new Map();
            }
            registerLink(e3) {
              const t3 = this._bufferService.buffer;
              if (void 0 === e3.id) {
                const i11 = t3.addMarker(t3.ybase + t3.y), s4 = { data: e3, id: this._nextId++, lines: [i11] };
                return i11.onDispose((() => this._removeMarkerFromLink(s4, i11))), this._dataByLinkId.set(s4.id, s4), s4.id;
              }
              const i10 = e3, s3 = this._getEntryIdKey(i10), r12 = this._entriesWithId.get(s3);
              if (r12) return this.addLineToLink(r12.id, t3.ybase + t3.y), r12.id;
              const n2 = t3.addMarker(t3.ybase + t3.y), o3 = { id: this._nextId++, key: this._getEntryIdKey(i10), data: i10, lines: [n2] };
              return n2.onDispose((() => this._removeMarkerFromLink(o3, n2))), this._entriesWithId.set(o3.key, o3), this._dataByLinkId.set(o3.id, o3), o3.id;
            }
            addLineToLink(e3, t3) {
              const i10 = this._dataByLinkId.get(e3);
              if (i10 && i10.lines.every(((e4) => e4.line !== t3))) {
                const e4 = this._bufferService.buffer.addMarker(t3);
                i10.lines.push(e4), e4.onDispose((() => this._removeMarkerFromLink(i10, e4)));
              }
            }
            getLinkData(e3) {
              var t3;
              return null === (t3 = this._dataByLinkId.get(e3)) || void 0 === t3 ? void 0 : t3.data;
            }
            _getEntryIdKey(e3) {
              return `${e3.id};;${e3.uri}`;
            }
            _removeMarkerFromLink(e3, t3) {
              const i10 = e3.lines.indexOf(t3);
              -1 !== i10 && (e3.lines.splice(i10, 1), 0 === e3.lines.length && (void 0 !== e3.data.id && this._entriesWithId.delete(e3.key), this._dataByLinkId.delete(e3.id)));
            }
          };
          t2.OscLinkService = o2 = s2([r11(0, n.IBufferService)], o2);
        }, 8343: (e2, t2) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.createDecorator = t2.getServiceDependencies = t2.serviceRegistry = void 0;
          const i9 = "di$target", s2 = "di$dependencies";
          t2.serviceRegistry = /* @__PURE__ */ new Map(), t2.getServiceDependencies = function(e3) {
            return e3[s2] || [];
          }, t2.createDecorator = function(e3) {
            if (t2.serviceRegistry.has(e3)) return t2.serviceRegistry.get(e3);
            const r11 = function(e4, t3, n) {
              if (3 !== arguments.length) throw new Error("@IServiceName-decorator can only be used to decorate a parameter");
              !(function(e5, t4, r12) {
                t4[i9] === t4 ? t4[s2].push({ id: e5, index: r12 }) : (t4[s2] = [{ id: e5, index: r12 }], t4[i9] = t4);
              })(r11, e4, n);
            };
            return r11.toString = () => e3, t2.serviceRegistry.set(e3, r11), r11;
          };
        }, 2585: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.IDecorationService = t2.IUnicodeService = t2.IOscLinkService = t2.IOptionsService = t2.ILogService = t2.LogLevelEnum = t2.IInstantiationService = t2.ICharsetService = t2.ICoreService = t2.ICoreMouseService = t2.IBufferService = void 0;
          const s2 = i9(8343);
          var r11;
          t2.IBufferService = (0, s2.createDecorator)("BufferService"), t2.ICoreMouseService = (0, s2.createDecorator)("CoreMouseService"), t2.ICoreService = (0, s2.createDecorator)("CoreService"), t2.ICharsetService = (0, s2.createDecorator)("CharsetService"), t2.IInstantiationService = (0, s2.createDecorator)("InstantiationService"), (function(e3) {
            e3[e3.TRACE = 0] = "TRACE", e3[e3.DEBUG = 1] = "DEBUG", e3[e3.INFO = 2] = "INFO", e3[e3.WARN = 3] = "WARN", e3[e3.ERROR = 4] = "ERROR", e3[e3.OFF = 5] = "OFF";
          })(r11 || (t2.LogLevelEnum = r11 = {})), t2.ILogService = (0, s2.createDecorator)("LogService"), t2.IOptionsService = (0, s2.createDecorator)("OptionsService"), t2.IOscLinkService = (0, s2.createDecorator)("OscLinkService"), t2.IUnicodeService = (0, s2.createDecorator)("UnicodeService"), t2.IDecorationService = (0, s2.createDecorator)("DecorationService");
        }, 1480: (e2, t2, i9) => {
          Object.defineProperty(t2, "__esModule", { value: true }), t2.UnicodeService = void 0;
          const s2 = i9(8460), r11 = i9(225);
          t2.UnicodeService = class {
            constructor() {
              this._providers = /* @__PURE__ */ Object.create(null), this._active = "", this._onChange = new s2.EventEmitter(), this.onChange = this._onChange.event;
              const e3 = new r11.UnicodeV6();
              this.register(e3), this._active = e3.version, this._activeProvider = e3;
            }
            dispose() {
              this._onChange.dispose();
            }
            get versions() {
              return Object.keys(this._providers);
            }
            get activeVersion() {
              return this._active;
            }
            set activeVersion(e3) {
              if (!this._providers[e3]) throw new Error(`unknown Unicode version "${e3}"`);
              this._active = e3, this._activeProvider = this._providers[e3], this._onChange.fire(e3);
            }
            register(e3) {
              this._providers[e3.version] = e3;
            }
            wcwidth(e3) {
              return this._activeProvider.wcwidth(e3);
            }
            getStringCellWidth(e3) {
              let t3 = 0;
              const i10 = e3.length;
              for (let s3 = 0; s3 < i10; ++s3) {
                let r12 = e3.charCodeAt(s3);
                if (55296 <= r12 && r12 <= 56319) {
                  if (++s3 >= i10) return t3 + this.wcwidth(r12);
                  const n = e3.charCodeAt(s3);
                  56320 <= n && n <= 57343 ? r12 = 1024 * (r12 - 55296) + n - 56320 + 65536 : t3 += this.wcwidth(n);
                }
                t3 += this.wcwidth(r12);
              }
              return t3;
            }
          };
        } }, t = {};
        function i8(s2) {
          var r11 = t[s2];
          if (void 0 !== r11) return r11.exports;
          var n = t[s2] = { exports: {} };
          return e[s2].call(n.exports, n, n.exports, i8), n.exports;
        }
        var s = {};
        return (() => {
          var e2 = s;
          Object.defineProperty(e2, "__esModule", { value: true }), e2.Terminal = void 0;
          const t2 = i8(9042), r11 = i8(3236), n = i8(844), o2 = i8(5741), a = i8(8285), h2 = i8(7975), c = i8(7090), l2 = ["cols", "rows"];
          class d extends n.Disposable {
            constructor(e3) {
              super(), this._core = this.register(new r11.Terminal(e3)), this._addonManager = this.register(new o2.AddonManager()), this._publicOptions = Object.assign({}, this._core.options);
              const t3 = (e4) => this._core.options[e4], i9 = (e4, t4) => {
                this._checkReadonlyOptions(e4), this._core.options[e4] = t4;
              };
              for (const e4 in this._core.options) {
                const s2 = { get: t3.bind(this, e4), set: i9.bind(this, e4) };
                Object.defineProperty(this._publicOptions, e4, s2);
              }
            }
            _checkReadonlyOptions(e3) {
              if (l2.includes(e3)) throw new Error(`Option "${e3}" can only be set in the constructor`);
            }
            _checkProposedApi() {
              if (!this._core.optionsService.rawOptions.allowProposedApi) throw new Error("You must set the allowProposedApi option to true to use proposed API");
            }
            get onBell() {
              return this._core.onBell;
            }
            get onBinary() {
              return this._core.onBinary;
            }
            get onCursorMove() {
              return this._core.onCursorMove;
            }
            get onData() {
              return this._core.onData;
            }
            get onKey() {
              return this._core.onKey;
            }
            get onLineFeed() {
              return this._core.onLineFeed;
            }
            get onRender() {
              return this._core.onRender;
            }
            get onResize() {
              return this._core.onResize;
            }
            get onScroll() {
              return this._core.onScroll;
            }
            get onSelectionChange() {
              return this._core.onSelectionChange;
            }
            get onTitleChange() {
              return this._core.onTitleChange;
            }
            get onWriteParsed() {
              return this._core.onWriteParsed;
            }
            get element() {
              return this._core.element;
            }
            get parser() {
              return this._parser || (this._parser = new h2.ParserApi(this._core)), this._parser;
            }
            get unicode() {
              return this._checkProposedApi(), new c.UnicodeApi(this._core);
            }
            get textarea() {
              return this._core.textarea;
            }
            get rows() {
              return this._core.rows;
            }
            get cols() {
              return this._core.cols;
            }
            get buffer() {
              return this._buffer || (this._buffer = this.register(new a.BufferNamespaceApi(this._core))), this._buffer;
            }
            get markers() {
              return this._checkProposedApi(), this._core.markers;
            }
            get modes() {
              const e3 = this._core.coreService.decPrivateModes;
              let t3 = "none";
              switch (this._core.coreMouseService.activeProtocol) {
                case "X10":
                  t3 = "x10";
                  break;
                case "VT200":
                  t3 = "vt200";
                  break;
                case "DRAG":
                  t3 = "drag";
                  break;
                case "ANY":
                  t3 = "any";
              }
              return { applicationCursorKeysMode: e3.applicationCursorKeys, applicationKeypadMode: e3.applicationKeypad, bracketedPasteMode: e3.bracketedPasteMode, insertMode: this._core.coreService.modes.insertMode, mouseTrackingMode: t3, originMode: e3.origin, reverseWraparoundMode: e3.reverseWraparound, sendFocusMode: e3.sendFocus, wraparoundMode: e3.wraparound };
            }
            get options() {
              return this._publicOptions;
            }
            set options(e3) {
              for (const t3 in e3) this._publicOptions[t3] = e3[t3];
            }
            blur() {
              this._core.blur();
            }
            focus() {
              this._core.focus();
            }
            resize(e3, t3) {
              this._verifyIntegers(e3, t3), this._core.resize(e3, t3);
            }
            open(e3) {
              this._core.open(e3);
            }
            attachCustomKeyEventHandler(e3) {
              this._core.attachCustomKeyEventHandler(e3);
            }
            registerLinkProvider(e3) {
              return this._core.registerLinkProvider(e3);
            }
            registerCharacterJoiner(e3) {
              return this._checkProposedApi(), this._core.registerCharacterJoiner(e3);
            }
            deregisterCharacterJoiner(e3) {
              this._checkProposedApi(), this._core.deregisterCharacterJoiner(e3);
            }
            registerMarker(e3 = 0) {
              return this._verifyIntegers(e3), this._core.registerMarker(e3);
            }
            registerDecoration(e3) {
              var t3, i9, s2;
              return this._checkProposedApi(), this._verifyPositiveIntegers(null !== (t3 = e3.x) && void 0 !== t3 ? t3 : 0, null !== (i9 = e3.width) && void 0 !== i9 ? i9 : 0, null !== (s2 = e3.height) && void 0 !== s2 ? s2 : 0), this._core.registerDecoration(e3);
            }
            hasSelection() {
              return this._core.hasSelection();
            }
            select(e3, t3, i9) {
              this._verifyIntegers(e3, t3, i9), this._core.select(e3, t3, i9);
            }
            getSelection() {
              return this._core.getSelection();
            }
            getSelectionPosition() {
              return this._core.getSelectionPosition();
            }
            clearSelection() {
              this._core.clearSelection();
            }
            selectAll() {
              this._core.selectAll();
            }
            selectLines(e3, t3) {
              this._verifyIntegers(e3, t3), this._core.selectLines(e3, t3);
            }
            dispose() {
              super.dispose();
            }
            scrollLines(e3) {
              this._verifyIntegers(e3), this._core.scrollLines(e3);
            }
            scrollPages(e3) {
              this._verifyIntegers(e3), this._core.scrollPages(e3);
            }
            scrollToTop() {
              this._core.scrollToTop();
            }
            scrollToBottom() {
              this._core.scrollToBottom();
            }
            scrollToLine(e3) {
              this._verifyIntegers(e3), this._core.scrollToLine(e3);
            }
            clear() {
              this._core.clear();
            }
            write(e3, t3) {
              this._core.write(e3, t3);
            }
            writeln(e3, t3) {
              this._core.write(e3), this._core.write("\r\n", t3);
            }
            paste(e3) {
              this._core.paste(e3);
            }
            refresh(e3, t3) {
              this._verifyIntegers(e3, t3), this._core.refresh(e3, t3);
            }
            reset() {
              this._core.reset();
            }
            clearTextureAtlas() {
              this._core.clearTextureAtlas();
            }
            loadAddon(e3) {
              this._addonManager.loadAddon(this, e3);
            }
            static get strings() {
              return t2;
            }
            _verifyIntegers(...e3) {
              for (const t3 of e3) if (t3 === 1 / 0 || isNaN(t3) || t3 % 1 != 0) throw new Error("This API only accepts integers");
            }
            _verifyPositiveIntegers(...e3) {
              for (const t3 of e3) if (t3 && (t3 === 1 / 0 || isNaN(t3) || t3 % 1 != 0 || t3 < 0)) throw new Error("This API only accepts positive integers");
            }
          }
          e2.Terminal = d;
        })(), s;
      })()));
    }
  });

  // friscy-bundle/app.ts
  var import_xterm = __toESM(require_xterm(), 1);

  // node_modules/@xterm/addon-fit/lib/addon-fit.mjs
  var h = 2;
  var _ = 1;
  var o = class {
    activate(e) {
      this._terminal = e;
    }
    dispose() {
    }
    fit() {
      let e = this.proposeDimensions();
      if (!e || !this._terminal || isNaN(e.cols) || isNaN(e.rows)) return;
      let t = this._terminal._core;
      (this._terminal.rows !== e.rows || this._terminal.cols !== e.cols) && (t._renderService.clear(), this._terminal.resize(e.cols, e.rows));
    }
    proposeDimensions() {
      if (!this._terminal || !this._terminal.element || !this._terminal.element.parentElement) return;
      let t = this._terminal._core._renderService.dimensions;
      if (t.css.cell.width === 0 || t.css.cell.height === 0) return;
      let s = this._terminal.options.scrollback === 0 ? 0 : this._terminal.options.overviewRuler?.width || 14, r11 = window.getComputedStyle(this._terminal.element.parentElement), l2 = parseInt(r11.getPropertyValue("height")), a = Math.max(0, parseInt(r11.getPropertyValue("width"))), i8 = window.getComputedStyle(this._terminal.element), n = { top: parseInt(i8.getPropertyValue("padding-top")), bottom: parseInt(i8.getPropertyValue("padding-bottom")), right: parseInt(i8.getPropertyValue("padding-right")), left: parseInt(i8.getPropertyValue("padding-left")) }, m = n.top + n.bottom, d = n.right + n.left, c = l2 - m, p = a - d - s;
      return { cols: Math.max(h, Math.floor(p / t.css.cell.width)), rows: Math.max(_, Math.floor(c / t.css.cell.height)) };
    }
  };

  // node_modules/@xterm/addon-web-links/lib/addon-web-links.mjs
  var v = class {
    constructor(e, t, n, o2 = {}) {
      this._terminal = e;
      this._regex = t;
      this._handler = n;
      this._options = o2;
    }
    provideLinks(e, t) {
      let n = g.computeLink(e, this._regex, this._terminal, this._handler);
      t(this._addCallbacks(n));
    }
    _addCallbacks(e) {
      return e.map((t) => (t.leave = this._options.leave, t.hover = (n, o2) => {
        if (this._options.hover) {
          let { range: p } = t;
          this._options.hover(n, o2, p);
        }
      }, t));
    }
  };
  function k(l2) {
    try {
      let e = new URL(l2), t = e.password && e.username ? `${e.protocol}//${e.username}:${e.password}@${e.host}` : e.username ? `${e.protocol}//${e.username}@${e.host}` : `${e.protocol}//${e.host}`;
      return l2.toLocaleLowerCase().startsWith(t.toLocaleLowerCase());
    } catch {
      return false;
    }
  }
  var g = class l {
    static computeLink(e, t, n, o2) {
      let p = new RegExp(t.source, (t.flags || "") + "g"), [i8, r11] = l._getWindowedLineStrings(e - 1, n), s = i8.join(""), a, d = [];
      for (; a = p.exec(s); ) {
        let u = a[0];
        if (!k(u)) continue;
        let [c, h2] = l._mapStrIdx(n, r11, 0, a.index), [m, f] = l._mapStrIdx(n, c, h2, u.length);
        if (c === -1 || h2 === -1 || m === -1 || f === -1) continue;
        let b = { start: { x: h2 + 1, y: c + 1 }, end: { x: f, y: m + 1 } };
        d.push({ range: b, text: u, activate: o2 });
      }
      return d;
    }
    static _getWindowedLineStrings(e, t) {
      let n, o2 = e, p = e, i8 = 0, r11 = "", s = [];
      if (n = t.buffer.active.getLine(e)) {
        let a = n.translateToString(true);
        if (n.isWrapped && a[0] !== " ") {
          for (i8 = 0; (n = t.buffer.active.getLine(--o2)) && i8 < 2048 && (r11 = n.translateToString(true), i8 += r11.length, s.push(r11), !(!n.isWrapped || r11.indexOf(" ") !== -1)); ) ;
          s.reverse();
        }
        for (s.push(a), i8 = 0; (n = t.buffer.active.getLine(++p)) && n.isWrapped && i8 < 2048 && (r11 = n.translateToString(true), i8 += r11.length, s.push(r11), r11.indexOf(" ") === -1); ) ;
      }
      return [s, o2];
    }
    static _mapStrIdx(e, t, n, o2) {
      let p = e.buffer.active, i8 = p.getNullCell(), r11 = n;
      for (; o2; ) {
        let s = p.getLine(t);
        if (!s) return [-1, -1];
        for (let a = r11; a < s.length; ++a) {
          s.getCell(a, i8);
          let d = i8.getChars();
          if (i8.getWidth() && (o2 -= d.length || 1, a === s.length - 1 && d === "")) {
            let c = p.getLine(t + 1);
            c && c.isWrapped && (c.getCell(0, i8), i8.getWidth() === 2 && (o2 += 1));
          }
          if (o2 < 0) return [t, a];
        }
        t++, r11 = 0;
      }
      return [t, r11];
    }
  };
  var _2 = /(https?|HTTPS?):[/]{2}[^\s"'!*(){}|\\\^<>`]*[^\s"':,.!?{}|\\\^~\[\]`()<>]/;
  function w(l2, e) {
    let t = window.open();
    if (t) {
      try {
        t.opener = null;
      } catch {
      }
      t.location.href = e;
    } else console.warn("Opening link blocked as opener could not be cleared");
  }
  var L = class {
    constructor(e = w, t = {}) {
      this._handler = e;
      this._options = t;
    }
    activate(e) {
      this._terminal = e;
      let t = this._options, n = t.urlRegex || _2;
      this._linkProvider = this._terminal.registerLinkProvider(new v(this._terminal, n, this._handler, t));
    }
    dispose() {
      this._linkProvider?.dispose();
    }
  };

  // node_modules/@xterm/addon-unicode11/lib/addon-unicode11.mjs
  var ue = [[768, 879], [1155, 1158], [1160, 1161], [1425, 1469], [1471, 1471], [1473, 1474], [1476, 1477], [1479, 1479], [1536, 1539], [1552, 1557], [1611, 1630], [1648, 1648], [1750, 1764], [1767, 1768], [1770, 1773], [1807, 1807], [1809, 1809], [1840, 1866], [1958, 1968], [2027, 2035], [2305, 2306], [2364, 2364], [2369, 2376], [2381, 2381], [2385, 2388], [2402, 2403], [2433, 2433], [2492, 2492], [2497, 2500], [2509, 2509], [2530, 2531], [2561, 2562], [2620, 2620], [2625, 2626], [2631, 2632], [2635, 2637], [2672, 2673], [2689, 2690], [2748, 2748], [2753, 2757], [2759, 2760], [2765, 2765], [2786, 2787], [2817, 2817], [2876, 2876], [2879, 2879], [2881, 2883], [2893, 2893], [2902, 2902], [2946, 2946], [3008, 3008], [3021, 3021], [3134, 3136], [3142, 3144], [3146, 3149], [3157, 3158], [3260, 3260], [3263, 3263], [3270, 3270], [3276, 3277], [3298, 3299], [3393, 3395], [3405, 3405], [3530, 3530], [3538, 3540], [3542, 3542], [3633, 3633], [3636, 3642], [3655, 3662], [3761, 3761], [3764, 3769], [3771, 3772], [3784, 3789], [3864, 3865], [3893, 3893], [3895, 3895], [3897, 3897], [3953, 3966], [3968, 3972], [3974, 3975], [3984, 3991], [3993, 4028], [4038, 4038], [4141, 4144], [4146, 4146], [4150, 4151], [4153, 4153], [4184, 4185], [4448, 4607], [4959, 4959], [5906, 5908], [5938, 5940], [5970, 5971], [6002, 6003], [6068, 6069], [6071, 6077], [6086, 6086], [6089, 6099], [6109, 6109], [6155, 6157], [6313, 6313], [6432, 6434], [6439, 6440], [6450, 6450], [6457, 6459], [6679, 6680], [6912, 6915], [6964, 6964], [6966, 6970], [6972, 6972], [6978, 6978], [7019, 7027], [7616, 7626], [7678, 7679], [8203, 8207], [8234, 8238], [8288, 8291], [8298, 8303], [8400, 8431], [12330, 12335], [12441, 12442], [43014, 43014], [43019, 43019], [43045, 43046], [64286, 64286], [65024, 65039], [65056, 65059], [65279, 65279], [65529, 65531]];
  var qe = [[68097, 68099], [68101, 68102], [68108, 68111], [68152, 68154], [68159, 68159], [119143, 119145], [119155, 119170], [119173, 119179], [119210, 119213], [119362, 119364], [917505, 917505], [917536, 917631], [917760, 917999]];
  var A;
  function He(r11, e) {
    let t = 0, n = e.length - 1, o2;
    if (r11 < e[0][0] || r11 > e[n][1]) return false;
    for (; n >= t; ) if (o2 = t + n >> 1, r11 > e[o2][1]) t = o2 + 1;
    else if (r11 < e[o2][0]) n = o2 - 1;
    else return true;
    return false;
  }
  var H = class {
    constructor() {
      this.version = "6";
      if (!A) {
        A = new Uint8Array(65536), A.fill(1), A[0] = 0, A.fill(0, 1, 32), A.fill(0, 127, 160), A.fill(2, 4352, 4448), A[9001] = 2, A[9002] = 2, A.fill(2, 11904, 42192), A[12351] = 1, A.fill(2, 44032, 55204), A.fill(2, 63744, 64256), A.fill(2, 65040, 65050), A.fill(2, 65072, 65136), A.fill(2, 65280, 65377), A.fill(2, 65504, 65511);
        for (let e = 0; e < ue.length; ++e) A.fill(0, ue[e][0], ue[e][1] + 1);
      }
    }
    wcwidth(e) {
      return e < 32 ? 0 : e < 127 ? 1 : e < 65536 ? A[e] : He(e, qe) ? 0 : e >= 131072 && e <= 196605 || e >= 196608 && e <= 262141 ? 2 : 1;
    }
    charProperties(e, t) {
      let n = this.wcwidth(e), o2 = n === 0 && t !== 0;
      if (o2) {
        let d = w2.extractWidth(t);
        d === 0 ? o2 = false : d > n && (n = d);
      }
      return w2.createPropertyValue(0, n, o2);
    }
  };
  var de = class {
    constructor() {
      this.listeners = [], this.unexpectedErrorHandler = function(e) {
        setTimeout(() => {
          throw e.stack ? J.isErrorNoTelemetry(e) ? new J(e.message + `

` + e.stack) : new Error(e.message + `

` + e.stack) : e;
        }, 0);
      };
    }
    addListener(e) {
      return this.listeners.push(e), () => {
        this._removeListener(e);
      };
    }
    emit(e) {
      this.listeners.forEach((t) => {
        t(e);
      });
    }
    _removeListener(e) {
      this.listeners.splice(this.listeners.indexOf(e), 1);
    }
    setUnexpectedErrorHandler(e) {
      this.unexpectedErrorHandler = e;
    }
    getUnexpectedErrorHandler() {
      return this.unexpectedErrorHandler;
    }
    onUnexpectedError(e) {
      this.unexpectedErrorHandler(e), this.emit(e);
    }
    onUnexpectedExternalError(e) {
      this.unexpectedErrorHandler(e);
    }
  };
  var Ge = new de();
  function Y(r11) {
    Je(r11) || Ge.onUnexpectedError(r11);
  }
  var ce = "Canceled";
  function Je(r11) {
    return r11 instanceof G ? true : r11 instanceof Error && r11.name === ce && r11.message === ce;
  }
  var G = class extends Error {
    constructor() {
      super(ce), this.name = this.message;
    }
  };
  var J = class r extends Error {
    constructor(e) {
      super(e), this.name = "CodeExpectedError";
    }
    static fromError(e) {
      if (e instanceof r) return e;
      let t = new r();
      return t.message = e.message, t.stack = e.stack, t;
    }
    static isErrorNoTelemetry(e) {
      return e.name === "CodeExpectedError";
    }
  };
  function pe(r11, e) {
    let t = this, n = false, o2;
    return function() {
      if (n) return o2;
      if (n = true, e) try {
        o2 = r11.apply(t, arguments);
      } finally {
        e();
      }
      else o2 = r11.apply(t, arguments);
      return o2;
    };
  }
  function Ye(r11, e, t = 0, n = r11.length) {
    let o2 = t, d = n;
    for (; o2 < d; ) {
      let v3 = Math.floor((o2 + d) / 2);
      e(r11[v3]) ? o2 = v3 + 1 : d = v3;
    }
    return o2 - 1;
  }
  var X = class X2 {
    constructor(e) {
      this._array = e;
      this._findLastMonotonousLastIdx = 0;
    }
    findLastMonotonous(e) {
      if (X2.assertInvariants) {
        if (this._prevFindLastPredicate) {
          for (let n of this._array) if (this._prevFindLastPredicate(n) && !e(n)) throw new Error("MonotonousArray: current predicate must be weaker than (or equal to) the previous predicate.");
        }
        this._prevFindLastPredicate = e;
      }
      let t = Ye(this._array, e, this._findLastMonotonousLastIdx);
      return this._findLastMonotonousLastIdx = t + 1, t === -1 ? void 0 : this._array[t];
    }
  };
  X.assertInvariants = false;
  var Be;
  ((E) => {
    function r11(p) {
      return p < 0;
    }
    E.isLessThan = r11;
    function e(p) {
      return p <= 0;
    }
    E.isLessThanOrEqual = e;
    function t(p) {
      return p > 0;
    }
    E.isGreaterThan = t;
    function n(p) {
      return p === 0;
    }
    E.isNeitherLessOrGreaterThan = n, E.greaterThan = 1, E.lessThan = -1, E.neitherLessOrGreaterThan = 0;
  })(Be || (Be = {}));
  function we(r11, e) {
    return (t, n) => e(r11(t), r11(n));
  }
  var ke = (r11, e) => r11 - e;
  var R = class R2 {
    constructor(e) {
      this.iterate = e;
    }
    forEach(e) {
      this.iterate((t) => (e(t), true));
    }
    toArray() {
      let e = [];
      return this.iterate((t) => (e.push(t), true)), e;
    }
    filter(e) {
      return new R2((t) => this.iterate((n) => e(n) ? t(n) : true));
    }
    map(e) {
      return new R2((t) => this.iterate((n) => t(e(n))));
    }
    some(e) {
      let t = false;
      return this.iterate((n) => (t = e(n), !t)), t;
    }
    findFirst(e) {
      let t;
      return this.iterate((n) => e(n) ? (t = n, false) : true), t;
    }
    findLast(e) {
      let t;
      return this.iterate((n) => (e(n) && (t = n), true)), t;
    }
    findLastMaxBy(e) {
      let t, n = true;
      return this.iterate((o2) => ((n || Be.isGreaterThan(e(o2, t))) && (n = false, t = o2), true)), t;
    }
  };
  R.empty = new R((e) => {
  });
  function Oe(r11, e) {
    let t = /* @__PURE__ */ Object.create(null);
    for (let n of r11) {
      let o2 = e(n), d = t[o2];
      d || (d = t[o2] = []), d.push(n);
    }
    return t;
  }
  var Se;
  var Re;
  var Le = class {
    constructor(e, t) {
      this.toKey = t;
      this._map = /* @__PURE__ */ new Map();
      this[Se] = "SetWithKey";
      for (let n of e) this.add(n);
    }
    get size() {
      return this._map.size;
    }
    add(e) {
      let t = this.toKey(e);
      return this._map.set(t, e), this;
    }
    delete(e) {
      return this._map.delete(this.toKey(e));
    }
    has(e) {
      return this._map.has(this.toKey(e));
    }
    *entries() {
      for (let e of this._map.values()) yield [e, e];
    }
    keys() {
      return this.values();
    }
    *values() {
      for (let e of this._map.values()) yield e;
    }
    clear() {
      this._map.clear();
    }
    forEach(e, t) {
      this._map.forEach((n) => e.call(t, n, n, this));
    }
    [(Re = Symbol.iterator, Se = Symbol.toStringTag, Re)]() {
      return this.values();
    }
  };
  var Z = class {
    constructor() {
      this.map = /* @__PURE__ */ new Map();
    }
    add(e, t) {
      let n = this.map.get(e);
      n || (n = /* @__PURE__ */ new Set(), this.map.set(e, n)), n.add(t);
    }
    delete(e, t) {
      let n = this.map.get(e);
      n && (n.delete(t), n.size === 0 && this.map.delete(e));
    }
    forEach(e, t) {
      let n = this.map.get(e);
      n && n.forEach(t);
    }
    get(e) {
      let t = this.map.get(e);
      return t || /* @__PURE__ */ new Set();
    }
  };
  var fe;
  ((le4) => {
    function r11(u) {
      return u && typeof u == "object" && typeof u[Symbol.iterator] == "function";
    }
    le4.is = r11;
    let e = Object.freeze([]);
    function t() {
      return e;
    }
    le4.empty = t;
    function* n(u) {
      yield u;
    }
    le4.single = n;
    function o2(u) {
      return r11(u) ? u : n(u);
    }
    le4.wrap = o2;
    function d(u) {
      return u || e;
    }
    le4.from = d;
    function* v3(u) {
      for (let f = u.length - 1; f >= 0; f--) yield u[f];
    }
    le4.reverse = v3;
    function E(u) {
      return !u || u[Symbol.iterator]().next().done === true;
    }
    le4.isEmpty = E;
    function p(u) {
      return u[Symbol.iterator]().next().value;
    }
    le4.first = p;
    function b(u, f) {
      let m = 0;
      for (let g2 of u) if (f(g2, m++)) return true;
      return false;
    }
    le4.some = b;
    function D2(u, f) {
      for (let m of u) if (f(m)) return m;
    }
    le4.find = D2;
    function* T2(u, f) {
      for (let m of u) f(m) && (yield m);
    }
    le4.filter = T2;
    function* B4(u, f) {
      let m = 0;
      for (let g2 of u) yield f(g2, m++);
    }
    le4.map = B4;
    function* L2(u, f) {
      let m = 0;
      for (let g2 of u) yield* f(g2, m++);
    }
    le4.flatMap = L2;
    function* oe(...u) {
      for (let f of u) yield* f;
    }
    le4.concat = oe;
    function z3(u, f, m) {
      let g2 = m;
      for (let W3 of u) g2 = f(g2, W3);
      return g2;
    }
    le4.reduce = z3;
    function* k4(u, f, m = u.length) {
      for (f < 0 && (f += u.length), m < 0 ? m += u.length : m > u.length && (m = u.length); f < m; f++) yield u[f];
    }
    le4.slice = k4;
    function ae3(u, f = Number.POSITIVE_INFINITY) {
      let m = [];
      if (f === 0) return [m, u];
      let g2 = u[Symbol.iterator]();
      for (let W3 = 0; W3 < f; W3++) {
        let xe3 = g2.next();
        if (xe3.done) return [m, le4.empty()];
        m.push(xe3.value);
      }
      return [m, { [Symbol.iterator]() {
        return g2;
      } }];
    }
    le4.consume = ae3;
    async function V5(u) {
      let f = [];
      for await (let m of u) f.push(m);
      return Promise.resolve(f);
    }
    le4.asyncToArray = V5;
  })(fe || (fe = {}));
  var Xe = false;
  var O = null;
  var ee = class ee2 {
    constructor() {
      this.livingDisposables = /* @__PURE__ */ new Map();
    }
    getDisposableData(e) {
      let t = this.livingDisposables.get(e);
      return t || (t = { parent: null, source: null, isSingleton: false, value: e, idx: ee2.idx++ }, this.livingDisposables.set(e, t)), t;
    }
    trackDisposable(e) {
      let t = this.getDisposableData(e);
      t.source || (t.source = new Error().stack);
    }
    setParent(e, t) {
      let n = this.getDisposableData(e);
      n.parent = t;
    }
    markAsDisposed(e) {
      this.livingDisposables.delete(e);
    }
    markAsSingleton(e) {
      this.getDisposableData(e).isSingleton = true;
    }
    getRootParent(e, t) {
      let n = t.get(e);
      if (n) return n;
      let o2 = e.parent ? this.getRootParent(this.getDisposableData(e.parent), t) : e;
      return t.set(e, o2), o2;
    }
    getTrackedDisposables() {
      let e = /* @__PURE__ */ new Map();
      return [...this.livingDisposables.entries()].filter(([, n]) => n.source !== null && !this.getRootParent(n, e).isSingleton).flatMap(([n]) => n);
    }
    computeLeakingDisposables(e = 10, t) {
      let n;
      if (t) n = t;
      else {
        let p = /* @__PURE__ */ new Map(), b = [...this.livingDisposables.values()].filter((T2) => T2.source !== null && !this.getRootParent(T2, p).isSingleton);
        if (b.length === 0) return;
        let D2 = new Set(b.map((T2) => T2.value));
        if (n = b.filter((T2) => !(T2.parent && D2.has(T2.parent))), n.length === 0) throw new Error("There are cyclic diposable chains!");
      }
      if (!n) return;
      function o2(p) {
        function b(T2, B4) {
          for (; T2.length > 0 && B4.some((L2) => typeof L2 == "string" ? L2 === T2[0] : T2[0].match(L2)); ) T2.shift();
        }
        let D2 = p.source.split(`
`).map((T2) => T2.trim().replace("at ", "")).filter((T2) => T2 !== "");
        return b(D2, ["Error", /^trackDisposable \(.*\)$/, /^DisposableTracker.trackDisposable \(.*\)$/]), D2.reverse();
      }
      let d = new Z();
      for (let p of n) {
        let b = o2(p);
        for (let D2 = 0; D2 <= b.length; D2++) d.add(b.slice(0, D2).join(`
`), p);
      }
      n.sort(we((p) => p.idx, ke));
      let v3 = "", E = 0;
      for (let p of n.slice(0, e)) {
        E++;
        let b = o2(p), D2 = [];
        for (let T2 = 0; T2 < b.length; T2++) {
          let B4 = b[T2];
          B4 = `(shared with ${d.get(b.slice(0, T2 + 1).join(`
`)).size}/${n.length} leaks) at ${B4}`;
          let oe = d.get(b.slice(0, T2).join(`
`)), z3 = Oe([...oe].map((k4) => o2(k4)[T2]), (k4) => k4);
          delete z3[b[T2]];
          for (let [k4, ae3] of Object.entries(z3)) D2.unshift(`    - stacktraces of ${ae3.length} other leaks continue with ${k4}`);
          D2.unshift(B4);
        }
        v3 += `


==================== Leaking disposable ${E}/${n.length}: ${p.value.constructor.name} ====================
${D2.join(`
`)}
============================================================

`;
      }
      return n.length > e && (v3 += `


... and ${n.length - e} more leaking disposables

`), { leaks: n, details: v3 };
    }
  };
  ee.idx = 0;
  function Ze(r11) {
    O = r11;
  }
  if (Xe) {
    let r11 = "__is_disposable_tracked__";
    Ze(new class {
      trackDisposable(e) {
        let t = new Error("Potentially leaked disposable").stack;
        setTimeout(() => {
          e[r11] || console.log(t);
        }, 3e3);
      }
      setParent(e, t) {
        if (e && e !== _3.None) try {
          e[r11] = true;
        } catch {
        }
      }
      markAsDisposed(e) {
        if (e && e !== _3.None) try {
          e[r11] = true;
        } catch {
        }
      }
      markAsSingleton(e) {
      }
    }());
  }
  function Te(r11) {
    return O?.trackDisposable(r11), r11;
  }
  function ve(r11) {
    O?.markAsDisposed(r11);
  }
  function he(r11, e) {
    O?.setParent(r11, e);
  }
  function et(r11, e) {
    if (O) for (let t of r11) O.setParent(t, e);
  }
  function Pe(r11) {
    if (fe.is(r11)) {
      let e = [];
      for (let t of r11) if (t) try {
        t.dispose();
      } catch (n) {
        e.push(n);
      }
      if (e.length === 1) throw e[0];
      if (e.length > 1) throw new AggregateError(e, "Encountered errors while disposing of store");
      return Array.isArray(r11) ? [] : r11;
    } else if (r11) return r11.dispose(), r11;
  }
  function Me(...r11) {
    let e = me(() => Pe(r11));
    return et(r11, e), e;
  }
  function me(r11) {
    let e = Te({ dispose: pe(() => {
      ve(e), r11();
    }) });
    return e;
  }
  var te = class te2 {
    constructor() {
      this._toDispose = /* @__PURE__ */ new Set();
      this._isDisposed = false;
      Te(this);
    }
    dispose() {
      this._isDisposed || (ve(this), this._isDisposed = true, this.clear());
    }
    get isDisposed() {
      return this._isDisposed;
    }
    clear() {
      if (this._toDispose.size !== 0) try {
        Pe(this._toDispose);
      } finally {
        this._toDispose.clear();
      }
    }
    add(e) {
      if (!e) return e;
      if (e === this) throw new Error("Cannot register a disposable on itself!");
      return he(e, this), this._isDisposed ? te2.DISABLE_DISPOSED_WARNING || console.warn(new Error("Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!").stack) : this._toDispose.add(e), e;
    }
    delete(e) {
      if (e) {
        if (e === this) throw new Error("Cannot dispose a disposable on itself!");
        this._toDispose.delete(e), e.dispose();
      }
    }
    deleteAndLeak(e) {
      e && this._toDispose.has(e) && (this._toDispose.delete(e), he(e, null));
    }
  };
  te.DISABLE_DISPOSED_WARNING = false;
  var U = te;
  var _3 = class {
    constructor() {
      this._store = new U();
      Te(this), he(this._store, this);
    }
    dispose() {
      ve(this), this._store.dispose();
    }
    _register(e) {
      if (e === this) throw new Error("Cannot register a disposable on itself!");
      return this._store.add(e);
    }
  };
  _3.None = Object.freeze({ dispose() {
  } });
  var P = class P2 {
    constructor(e) {
      this.element = e, this.next = P2.Undefined, this.prev = P2.Undefined;
    }
  };
  P.Undefined = new P(void 0);
  var tt = globalThis.performance && typeof globalThis.performance.now == "function";
  var ne = class r2 {
    static create(e) {
      return new r2(e);
    }
    constructor(e) {
      this._now = tt && e === false ? Date.now : globalThis.performance.now.bind(globalThis.performance), this._startTime = this._now(), this._stopTime = -1;
    }
    stop() {
      this._stopTime = this._now();
    }
    reset() {
      this._startTime = this._now(), this._stopTime = -1;
    }
    elapsed() {
      return this._stopTime !== -1 ? this._stopTime - this._startTime : this._now() - this._startTime;
    }
  };
  var nt = false;
  var Ve = false;
  var rt = false;
  var it;
  ((Q4) => {
    Q4.None = () => _3.None;
    function e(l2) {
      if (rt) {
        let { onDidAddListener: i8 } = l2, a = K.create(), s = 0;
        l2.onDidAddListener = () => {
          ++s === 2 && (console.warn("snapshotted emitter LIKELY used public and SHOULD HAVE BEEN created with DisposableStore. snapshotted here"), a.print()), i8?.();
        };
      }
    }
    function t(l2, i8) {
      return B4(l2, () => {
      }, 0, void 0, true, void 0, i8);
    }
    Q4.defer = t;
    function n(l2) {
      return (i8, a = null, s) => {
        let x = false, c;
        return c = l2((h2) => {
          if (!x) return c ? c.dispose() : x = true, i8.call(a, h2);
        }, null, s), x && c.dispose(), c;
      };
    }
    Q4.once = n;
    function o2(l2, i8, a) {
      return D2((s, x = null, c) => l2((h2) => s.call(x, i8(h2)), null, c), a);
    }
    Q4.map = o2;
    function d(l2, i8, a) {
      return D2((s, x = null, c) => l2((h2) => {
        i8(h2), s.call(x, h2);
      }, null, c), a);
    }
    Q4.forEach = d;
    function v3(l2, i8, a) {
      return D2((s, x = null, c) => l2((h2) => i8(h2) && s.call(x, h2), null, c), a);
    }
    Q4.filter = v3;
    function E(l2) {
      return l2;
    }
    Q4.signal = E;
    function p(...l2) {
      return (i8, a = null, s) => {
        let x = Me(...l2.map((c) => c((h2) => i8.call(a, h2))));
        return T2(x, s);
      };
    }
    Q4.any = p;
    function b(l2, i8, a, s) {
      let x = a;
      return o2(l2, (c) => (x = i8(x, c), x), s);
    }
    Q4.reduce = b;
    function D2(l2, i8) {
      let a, s = { onWillAddFirstListener() {
        a = l2(x.fire, x);
      }, onDidRemoveLastListener() {
        a?.dispose();
      } };
      i8 || e(s);
      let x = new C(s);
      return i8?.add(x), x.event;
    }
    function T2(l2, i8) {
      return i8 instanceof Array ? i8.push(l2) : i8 && i8.add(l2), l2;
    }
    function B4(l2, i8, a = 100, s = false, x = false, c, h2) {
      let F4, y, S2, $4 = 0, j4, Ce3 = { leakWarningThreshold: c, onWillAddFirstListener() {
        F4 = l2((Qe4) => {
          $4++, y = i8(y, Qe4), s && !S2 && (q3.fire(y), y = void 0), j4 = () => {
            let $e3 = y;
            y = void 0, S2 = void 0, (!s || $4 > 1) && q3.fire($e3), $4 = 0;
          }, typeof a == "number" ? (clearTimeout(S2), S2 = setTimeout(j4, a)) : S2 === void 0 && (S2 = 0, queueMicrotask(j4));
        });
      }, onWillRemoveListener() {
        x && $4 > 0 && j4?.();
      }, onDidRemoveLastListener() {
        j4 = void 0, F4.dispose();
      } };
      h2 || e(Ce3);
      let q3 = new C(Ce3);
      return h2?.add(q3), q3.event;
    }
    Q4.debounce = B4;
    function L2(l2, i8 = 0, a) {
      return Q4.debounce(l2, (s, x) => s ? (s.push(x), s) : [x], i8, void 0, true, void 0, a);
    }
    Q4.accumulate = L2;
    function oe(l2, i8 = (s, x) => s === x, a) {
      let s = true, x;
      return v3(l2, (c) => {
        let h2 = s || !i8(c, x);
        return s = false, x = c, h2;
      }, a);
    }
    Q4.latch = oe;
    function z3(l2, i8, a) {
      return [Q4.filter(l2, i8, a), Q4.filter(l2, (s) => !i8(s), a)];
    }
    Q4.split = z3;
    function k4(l2, i8 = false, a = [], s) {
      let x = a.slice(), c = l2((y) => {
        x ? x.push(y) : F4.fire(y);
      });
      s && s.add(c);
      let h2 = () => {
        x?.forEach((y) => F4.fire(y)), x = null;
      }, F4 = new C({ onWillAddFirstListener() {
        c || (c = l2((y) => F4.fire(y)), s && s.add(c));
      }, onDidAddFirstListener() {
        x && (i8 ? setTimeout(h2) : h2());
      }, onDidRemoveLastListener() {
        c && c.dispose(), c = null;
      } });
      return s && s.add(F4), F4.event;
    }
    Q4.buffer = k4;
    function ae3(l2, i8) {
      return (s, x, c) => {
        let h2 = i8(new le4());
        return l2(function(F4) {
          let y = h2.evaluate(F4);
          y !== V5 && s.call(x, y);
        }, void 0, c);
      };
    }
    Q4.chain = ae3;
    let V5 = Symbol("HaltChainable");
    class le4 {
      constructor() {
        this.steps = [];
      }
      map(i8) {
        return this.steps.push(i8), this;
      }
      forEach(i8) {
        return this.steps.push((a) => (i8(a), a)), this;
      }
      filter(i8) {
        return this.steps.push((a) => i8(a) ? a : V5), this;
      }
      reduce(i8, a) {
        let s = a;
        return this.steps.push((x) => (s = i8(s, x), s)), this;
      }
      latch(i8 = (a, s) => a === s) {
        let a = true, s;
        return this.steps.push((x) => {
          let c = a || !i8(x, s);
          return a = false, s = x, c ? x : V5;
        }), this;
      }
      evaluate(i8) {
        for (let a of this.steps) if (i8 = a(i8), i8 === V5) break;
        return i8;
      }
    }
    function u(l2, i8, a = (s) => s) {
      let s = (...F4) => h2.fire(a(...F4)), x = () => l2.on(i8, s), c = () => l2.removeListener(i8, s), h2 = new C({ onWillAddFirstListener: x, onDidRemoveLastListener: c });
      return h2.event;
    }
    Q4.fromNodeEventEmitter = u;
    function f(l2, i8, a = (s) => s) {
      let s = (...F4) => h2.fire(a(...F4)), x = () => l2.addEventListener(i8, s), c = () => l2.removeEventListener(i8, s), h2 = new C({ onWillAddFirstListener: x, onDidRemoveLastListener: c });
      return h2.event;
    }
    Q4.fromDOMEventEmitter = f;
    function m(l2) {
      return new Promise((i8) => n(l2)(i8));
    }
    Q4.toPromise = m;
    function g2(l2) {
      let i8 = new C();
      return l2.then((a) => {
        i8.fire(a);
      }, () => {
        i8.fire(void 0);
      }).finally(() => {
        i8.dispose();
      }), i8.event;
    }
    Q4.fromPromise = g2;
    function W3(l2, i8) {
      return l2((a) => i8.fire(a));
    }
    Q4.forward = W3;
    function xe3(l2, i8, a) {
      return i8(a), l2((s) => i8(s));
    }
    Q4.runAndSubscribe = xe3;
    class ze4 {
      constructor(i8, a) {
        this._observable = i8;
        this._counter = 0;
        this._hasChanged = false;
        let s = { onWillAddFirstListener: () => {
          i8.addObserver(this);
        }, onDidRemoveLastListener: () => {
          i8.removeObserver(this);
        } };
        a || e(s), this.emitter = new C(s), a && a.add(this.emitter);
      }
      beginUpdate(i8) {
        this._counter++;
      }
      handlePossibleChange(i8) {
      }
      handleChange(i8, a) {
        this._hasChanged = true;
      }
      endUpdate(i8) {
        this._counter--, this._counter === 0 && (this._observable.reportChanges(), this._hasChanged && (this._hasChanged = false, this.emitter.fire(this._observable.get())));
      }
    }
    function ut3(l2, i8) {
      return new ze4(l2, i8).emitter.event;
    }
    Q4.fromObservable = ut3;
    function dt2(l2) {
      return (i8, a, s) => {
        let x = 0, c = false, h2 = { beginUpdate() {
          x++;
        }, endUpdate() {
          x--, x === 0 && (l2.reportChanges(), c && (c = false, i8.call(a)));
        }, handlePossibleChange() {
        }, handleChange() {
          c = true;
        } };
        l2.addObserver(h2), l2.reportChanges();
        let F4 = { dispose() {
          l2.removeObserver(h2);
        } };
        return s instanceof U ? s.add(F4) : Array.isArray(s) && s.push(F4), F4;
      };
    }
    Q4.fromObservableLight = dt2;
  })(it || (it = {}));
  var M = class M2 {
    constructor(e) {
      this.listenerCount = 0;
      this.invocationCount = 0;
      this.elapsedOverall = 0;
      this.durations = [];
      this.name = `${e}_${M2._idPool++}`, M2.all.add(this);
    }
    start(e) {
      this._stopWatch = new ne(), this.listenerCount = e;
    }
    stop() {
      if (this._stopWatch) {
        let e = this._stopWatch.elapsed();
        this.durations.push(e), this.elapsedOverall += e, this.invocationCount += 1, this._stopWatch = void 0;
      }
    }
  };
  M.all = /* @__PURE__ */ new Set(), M._idPool = 0;
  var be = M;
  var We = -1;
  var ie = class ie2 {
    constructor(e, t, n = (ie2._idPool++).toString(16).padStart(3, "0")) {
      this._errorHandler = e;
      this.threshold = t;
      this.name = n;
      this._warnCountdown = 0;
    }
    dispose() {
      this._stacks?.clear();
    }
    check(e, t) {
      let n = this.threshold;
      if (n <= 0 || t < n) return;
      this._stacks || (this._stacks = /* @__PURE__ */ new Map());
      let o2 = this._stacks.get(e.value) || 0;
      if (this._stacks.set(e.value, o2 + 1), this._warnCountdown -= 1, this._warnCountdown <= 0) {
        this._warnCountdown = n * 0.5;
        let [d, v3] = this.getMostFrequentStack(), E = `[${this.name}] potential listener LEAK detected, having ${t} listeners already. MOST frequent listener (${v3}):`;
        console.warn(E), console.warn(d);
        let p = new De(E, d);
        this._errorHandler(p);
      }
      return () => {
        let d = this._stacks.get(e.value) || 0;
        this._stacks.set(e.value, d - 1);
      };
    }
    getMostFrequentStack() {
      if (!this._stacks) return;
      let e, t = 0;
      for (let [n, o2] of this._stacks) (!e || t < o2) && (e = [n, o2], t = o2);
      return e;
    }
  };
  ie._idPool = 1;
  var Ee = ie;
  var K = class r3 {
    constructor(e) {
      this.value = e;
    }
    static create() {
      let e = new Error();
      return new r3(e.stack ?? "");
    }
    print() {
      console.warn(this.value.split(`
`).slice(2).join(`
`));
    }
  };
  var De = class extends Error {
    constructor(e, t) {
      super(e), this.name = "ListenerLeakError", this.stack = t;
    }
  };
  var Ae = class extends Error {
    constructor(e, t) {
      super(e), this.name = "ListenerRefusalError", this.stack = t;
    }
  };
  var st = 0;
  var N = class {
    constructor(e) {
      this.value = e;
      this.id = st++;
    }
  };
  var ot = 2;
  var at = (r11, e) => {
    if (r11 instanceof N) e(r11);
    else for (let t = 0; t < r11.length; t++) {
      let n = r11[t];
      n && e(n);
    }
  };
  var re;
  if (nt) {
    let r11 = [];
    setInterval(() => {
      r11.length !== 0 && (console.warn("[LEAKING LISTENERS] GC'ed these listeners that were NOT yet disposed:"), console.warn(r11.join(`
`)), r11.length = 0);
    }, 3e3), re = new FinalizationRegistry((e) => {
      typeof e == "string" && r11.push(e);
    });
  }
  var C = class {
    constructor(e) {
      this._size = 0;
      this._options = e, this._leakageMon = We > 0 || this._options?.leakWarningThreshold ? new Ee(e?.onListenerError ?? Y, this._options?.leakWarningThreshold ?? We) : void 0, this._perfMon = this._options?._profName ? new be(this._options._profName) : void 0, this._deliveryQueue = this._options?.deliveryQueue;
    }
    dispose() {
      if (!this._disposed) {
        if (this._disposed = true, this._deliveryQueue?.current === this && this._deliveryQueue.reset(), this._listeners) {
          if (Ve) {
            let e = this._listeners;
            queueMicrotask(() => {
              at(e, (t) => t.stack?.print());
            });
          }
          this._listeners = void 0, this._size = 0;
        }
        this._options?.onDidRemoveLastListener?.(), this._leakageMon?.dispose();
      }
    }
    get event() {
      return this._event ?? (this._event = (e, t, n) => {
        if (this._leakageMon && this._size > this._leakageMon.threshold ** 2) {
          let p = `[${this._leakageMon.name}] REFUSES to accept new listeners because it exceeded its threshold by far (${this._size} vs ${this._leakageMon.threshold})`;
          console.warn(p);
          let b = this._leakageMon.getMostFrequentStack() ?? ["UNKNOWN stack", -1], D2 = new Ae(`${p}. HINT: Stack shows most frequent listener (${b[1]}-times)`, b[0]);
          return (this._options?.onListenerError || Y)(D2), _3.None;
        }
        if (this._disposed) return _3.None;
        t && (e = e.bind(t));
        let o2 = new N(e), d, v3;
        this._leakageMon && this._size >= Math.ceil(this._leakageMon.threshold * 0.2) && (o2.stack = K.create(), d = this._leakageMon.check(o2.stack, this._size + 1)), Ve && (o2.stack = v3 ?? K.create()), this._listeners ? this._listeners instanceof N ? (this._deliveryQueue ?? (this._deliveryQueue = new Fe()), this._listeners = [this._listeners, o2]) : this._listeners.push(o2) : (this._options?.onWillAddFirstListener?.(this), this._listeners = o2, this._options?.onDidAddFirstListener?.(this)), this._size++;
        let E = me(() => {
          re?.unregister(E), d?.(), this._removeListener(o2);
        });
        if (n instanceof U ? n.add(E) : Array.isArray(n) && n.push(E), re) {
          let p = new Error().stack.split(`
`).slice(2, 3).join(`
`).trim(), b = /(file:|vscode-file:\/\/vscode-app)?(\/[^:]*:\d+:\d+)/.exec(p);
          re.register(E, b?.[2] ?? p, E);
        }
        return E;
      }), this._event;
    }
    _removeListener(e) {
      if (this._options?.onWillRemoveListener?.(this), !this._listeners) return;
      if (this._size === 1) {
        this._listeners = void 0, this._options?.onDidRemoveLastListener?.(this), this._size = 0;
        return;
      }
      let t = this._listeners, n = t.indexOf(e);
      if (n === -1) throw console.log("disposed?", this._disposed), console.log("size?", this._size), console.log("arr?", JSON.stringify(this._listeners)), new Error("Attempted to dispose unknown listener");
      this._size--, t[n] = void 0;
      let o2 = this._deliveryQueue.current === this;
      if (this._size * ot <= t.length) {
        let d = 0;
        for (let v3 = 0; v3 < t.length; v3++) t[v3] ? t[d++] = t[v3] : o2 && (this._deliveryQueue.end--, d < this._deliveryQueue.i && this._deliveryQueue.i--);
        t.length = d;
      }
    }
    _deliver(e, t) {
      if (!e) return;
      let n = this._options?.onListenerError || Y;
      if (!n) {
        e.value(t);
        return;
      }
      try {
        e.value(t);
      } catch (o2) {
        n(o2);
      }
    }
    _deliverQueue(e) {
      let t = e.current._listeners;
      for (; e.i < e.end; ) this._deliver(t[e.i++], e.value);
      e.reset();
    }
    fire(e) {
      if (this._deliveryQueue?.current && (this._deliverQueue(this._deliveryQueue), this._perfMon?.stop()), this._perfMon?.start(this._size), this._listeners) if (this._listeners instanceof N) this._deliver(this._listeners, e);
      else {
        let t = this._deliveryQueue;
        t.enqueue(this, e, this._listeners.length), this._deliverQueue(t);
      }
      this._perfMon?.stop();
    }
    hasListeners() {
      return this._size > 0;
    }
  };
  var Fe = class {
    constructor() {
      this.i = -1;
      this.end = 0;
    }
    enqueue(e, t, n) {
      this.i = 0, this.end = n, this.current = e, this.value = t;
    }
    reset() {
      this.i = this.end, this.current = void 0, this.value = void 0;
    }
  };
  var w2 = class r4 {
    constructor() {
      this._providers = /* @__PURE__ */ Object.create(null);
      this._active = "";
      this._onChange = new C();
      this.onChange = this._onChange.event;
      let e = new H();
      this.register(e), this._active = e.version, this._activeProvider = e;
    }
    static extractShouldJoin(e) {
      return (e & 1) !== 0;
    }
    static extractWidth(e) {
      return e >> 1 & 3;
    }
    static extractCharKind(e) {
      return e >> 3;
    }
    static createPropertyValue(e, t, n = false) {
      return (e & 16777215) << 3 | (t & 3) << 1 | (n ? 1 : 0);
    }
    dispose() {
      this._onChange.dispose();
    }
    get versions() {
      return Object.keys(this._providers);
    }
    get activeVersion() {
      return this._active;
    }
    set activeVersion(e) {
      if (!this._providers[e]) throw new Error(`unknown Unicode version "${e}"`);
      this._active = e, this._activeProvider = this._providers[e], this._onChange.fire(e);
    }
    register(e) {
      this._providers[e.version] = e;
    }
    wcwidth(e) {
      return this._activeProvider.wcwidth(e);
    }
    getStringCellWidth(e) {
      let t = 0, n = 0, o2 = e.length;
      for (let d = 0; d < o2; ++d) {
        let v3 = e.charCodeAt(d);
        if (55296 <= v3 && v3 <= 56319) {
          if (++d >= o2) return t + this.wcwidth(v3);
          let b = e.charCodeAt(d);
          56320 <= b && b <= 57343 ? v3 = (v3 - 55296) * 1024 + b - 56320 + 65536 : t += this.wcwidth(b);
        }
        let E = this.charProperties(v3, n), p = r4.extractWidth(E);
        r4.extractShouldJoin(E) && (p -= r4.extractWidth(n)), t += p, n = E;
      }
      return t;
    }
    charProperties(e, t) {
      return this._activeProvider.charProperties(e, t);
    }
  };
  var ye = [[768, 879], [1155, 1161], [1425, 1469], [1471, 1471], [1473, 1474], [1476, 1477], [1479, 1479], [1536, 1541], [1552, 1562], [1564, 1564], [1611, 1631], [1648, 1648], [1750, 1757], [1759, 1764], [1767, 1768], [1770, 1773], [1807, 1807], [1809, 1809], [1840, 1866], [1958, 1968], [2027, 2035], [2045, 2045], [2070, 2073], [2075, 2083], [2085, 2087], [2089, 2093], [2137, 2139], [2259, 2306], [2362, 2362], [2364, 2364], [2369, 2376], [2381, 2381], [2385, 2391], [2402, 2403], [2433, 2433], [2492, 2492], [2497, 2500], [2509, 2509], [2530, 2531], [2558, 2558], [2561, 2562], [2620, 2620], [2625, 2626], [2631, 2632], [2635, 2637], [2641, 2641], [2672, 2673], [2677, 2677], [2689, 2690], [2748, 2748], [2753, 2757], [2759, 2760], [2765, 2765], [2786, 2787], [2810, 2815], [2817, 2817], [2876, 2876], [2879, 2879], [2881, 2884], [2893, 2893], [2902, 2902], [2914, 2915], [2946, 2946], [3008, 3008], [3021, 3021], [3072, 3072], [3076, 3076], [3134, 3136], [3142, 3144], [3146, 3149], [3157, 3158], [3170, 3171], [3201, 3201], [3260, 3260], [3263, 3263], [3270, 3270], [3276, 3277], [3298, 3299], [3328, 3329], [3387, 3388], [3393, 3396], [3405, 3405], [3426, 3427], [3530, 3530], [3538, 3540], [3542, 3542], [3633, 3633], [3636, 3642], [3655, 3662], [3761, 3761], [3764, 3772], [3784, 3789], [3864, 3865], [3893, 3893], [3895, 3895], [3897, 3897], [3953, 3966], [3968, 3972], [3974, 3975], [3981, 3991], [3993, 4028], [4038, 4038], [4141, 4144], [4146, 4151], [4153, 4154], [4157, 4158], [4184, 4185], [4190, 4192], [4209, 4212], [4226, 4226], [4229, 4230], [4237, 4237], [4253, 4253], [4448, 4607], [4957, 4959], [5906, 5908], [5938, 5940], [5970, 5971], [6002, 6003], [6068, 6069], [6071, 6077], [6086, 6086], [6089, 6099], [6109, 6109], [6155, 6158], [6277, 6278], [6313, 6313], [6432, 6434], [6439, 6440], [6450, 6450], [6457, 6459], [6679, 6680], [6683, 6683], [6742, 6742], [6744, 6750], [6752, 6752], [6754, 6754], [6757, 6764], [6771, 6780], [6783, 6783], [6832, 6846], [6912, 6915], [6964, 6964], [6966, 6970], [6972, 6972], [6978, 6978], [7019, 7027], [7040, 7041], [7074, 7077], [7080, 7081], [7083, 7085], [7142, 7142], [7144, 7145], [7149, 7149], [7151, 7153], [7212, 7219], [7222, 7223], [7376, 7378], [7380, 7392], [7394, 7400], [7405, 7405], [7412, 7412], [7416, 7417], [7616, 7673], [7675, 7679], [8203, 8207], [8234, 8238], [8288, 8292], [8294, 8303], [8400, 8432], [11503, 11505], [11647, 11647], [11744, 11775], [12330, 12333], [12441, 12442], [42607, 42610], [42612, 42621], [42654, 42655], [42736, 42737], [43010, 43010], [43014, 43014], [43019, 43019], [43045, 43046], [43204, 43205], [43232, 43249], [43263, 43263], [43302, 43309], [43335, 43345], [43392, 43394], [43443, 43443], [43446, 43449], [43452, 43453], [43493, 43493], [43561, 43566], [43569, 43570], [43573, 43574], [43587, 43587], [43596, 43596], [43644, 43644], [43696, 43696], [43698, 43700], [43703, 43704], [43710, 43711], [43713, 43713], [43756, 43757], [43766, 43766], [44005, 44005], [44008, 44008], [44013, 44013], [64286, 64286], [65024, 65039], [65056, 65071], [65279, 65279], [65529, 65531]];
  var lt = [[66045, 66045], [66272, 66272], [66422, 66426], [68097, 68099], [68101, 68102], [68108, 68111], [68152, 68154], [68159, 68159], [68325, 68326], [68900, 68903], [69446, 69456], [69633, 69633], [69688, 69702], [69759, 69761], [69811, 69814], [69817, 69818], [69821, 69821], [69837, 69837], [69888, 69890], [69927, 69931], [69933, 69940], [70003, 70003], [70016, 70017], [70070, 70078], [70089, 70092], [70191, 70193], [70196, 70196], [70198, 70199], [70206, 70206], [70367, 70367], [70371, 70378], [70400, 70401], [70459, 70460], [70464, 70464], [70502, 70508], [70512, 70516], [70712, 70719], [70722, 70724], [70726, 70726], [70750, 70750], [70835, 70840], [70842, 70842], [70847, 70848], [70850, 70851], [71090, 71093], [71100, 71101], [71103, 71104], [71132, 71133], [71219, 71226], [71229, 71229], [71231, 71232], [71339, 71339], [71341, 71341], [71344, 71349], [71351, 71351], [71453, 71455], [71458, 71461], [71463, 71467], [71727, 71735], [71737, 71738], [72148, 72151], [72154, 72155], [72160, 72160], [72193, 72202], [72243, 72248], [72251, 72254], [72263, 72263], [72273, 72278], [72281, 72283], [72330, 72342], [72344, 72345], [72752, 72758], [72760, 72765], [72767, 72767], [72850, 72871], [72874, 72880], [72882, 72883], [72885, 72886], [73009, 73014], [73018, 73018], [73020, 73021], [73023, 73029], [73031, 73031], [73104, 73105], [73109, 73109], [73111, 73111], [73459, 73460], [78896, 78904], [92912, 92916], [92976, 92982], [94031, 94031], [94095, 94098], [113821, 113822], [113824, 113827], [119143, 119145], [119155, 119170], [119173, 119179], [119210, 119213], [119362, 119364], [121344, 121398], [121403, 121452], [121461, 121461], [121476, 121476], [121499, 121503], [121505, 121519], [122880, 122886], [122888, 122904], [122907, 122913], [122915, 122916], [122918, 122922], [123184, 123190], [123628, 123631], [125136, 125142], [125252, 125258], [917505, 917505], [917536, 917631], [917760, 917999]];
  var ge = [[4352, 4447], [8986, 8987], [9001, 9002], [9193, 9196], [9200, 9200], [9203, 9203], [9725, 9726], [9748, 9749], [9800, 9811], [9855, 9855], [9875, 9875], [9889, 9889], [9898, 9899], [9917, 9918], [9924, 9925], [9934, 9934], [9940, 9940], [9962, 9962], [9970, 9971], [9973, 9973], [9978, 9978], [9981, 9981], [9989, 9989], [9994, 9995], [10024, 10024], [10060, 10060], [10062, 10062], [10067, 10069], [10071, 10071], [10133, 10135], [10160, 10160], [10175, 10175], [11035, 11036], [11088, 11088], [11093, 11093], [11904, 11929], [11931, 12019], [12032, 12245], [12272, 12283], [12288, 12329], [12334, 12350], [12353, 12438], [12443, 12543], [12549, 12591], [12593, 12686], [12688, 12730], [12736, 12771], [12784, 12830], [12832, 12871], [12880, 19903], [19968, 42124], [42128, 42182], [43360, 43388], [44032, 55203], [63744, 64255], [65040, 65049], [65072, 65106], [65108, 65126], [65128, 65131], [65281, 65376], [65504, 65510]];
  var xt = [[94176, 94179], [94208, 100343], [100352, 101106], [110592, 110878], [110928, 110930], [110948, 110951], [110960, 111355], [126980, 126980], [127183, 127183], [127374, 127374], [127377, 127386], [127488, 127490], [127504, 127547], [127552, 127560], [127568, 127569], [127584, 127589], [127744, 127776], [127789, 127797], [127799, 127868], [127870, 127891], [127904, 127946], [127951, 127955], [127968, 127984], [127988, 127988], [127992, 128062], [128064, 128064], [128066, 128252], [128255, 128317], [128331, 128334], [128336, 128359], [128378, 128378], [128405, 128406], [128420, 128420], [128507, 128591], [128640, 128709], [128716, 128716], [128720, 128722], [128725, 128725], [128747, 128748], [128756, 128762], [128992, 129003], [129293, 129393], [129395, 129398], [129402, 129442], [129445, 129450], [129454, 129482], [129485, 129535], [129648, 129651], [129656, 129658], [129664, 129666], [129680, 129685], [131072, 196605], [196608, 262141]];
  var I;
  function je(r11, e) {
    let t = 0, n = e.length - 1, o2;
    if (r11 < e[0][0] || r11 > e[n][1]) return false;
    for (; n >= t; ) if (o2 = t + n >> 1, r11 > e[o2][1]) t = o2 + 1;
    else if (r11 < e[o2][0]) n = o2 - 1;
    else return true;
    return false;
  }
  var se = class {
    constructor() {
      this.version = "11";
      if (!I) {
        I = new Uint8Array(65536), I.fill(1), I[0] = 0, I.fill(0, 1, 32), I.fill(0, 127, 160);
        for (let e = 0; e < ye.length; ++e) I.fill(0, ye[e][0], ye[e][1] + 1);
        for (let e = 0; e < ge.length; ++e) I.fill(2, ge[e][0], ge[e][1] + 1);
      }
    }
    wcwidth(e) {
      return e < 32 ? 0 : e < 127 ? 1 : e < 65536 ? I[e] : je(e, lt) ? 0 : je(e, xt) ? 2 : 1;
    }
    charProperties(e, t) {
      let n = this.wcwidth(e), o2 = n === 0 && t !== 0;
      if (o2) {
        let d = w2.extractWidth(t);
        d === 0 ? o2 = false : d > n && (n = d);
      }
      return w2.createPropertyValue(0, n, o2);
    }
  };
  var Ke = class {
    activate(e) {
      e.unicode.register(new se());
    }
    dispose() {
    }
  };

  // node_modules/@xterm/addon-search/lib/addon-search.mjs
  var Re2 = class {
    constructor() {
      this.listeners = [], this.unexpectedErrorHandler = function(e) {
        setTimeout(() => {
          throw e.stack ? ae.isErrorNoTelemetry(e) ? new ae(e.message + `

` + e.stack) : new Error(e.message + `

` + e.stack) : e;
        }, 0);
      };
    }
    addListener(e) {
      return this.listeners.push(e), () => {
        this._removeListener(e);
      };
    }
    emit(e) {
      this.listeners.forEach((t) => {
        t(e);
      });
    }
    _removeListener(e) {
      this.listeners.splice(this.listeners.indexOf(e), 1);
    }
    setUnexpectedErrorHandler(e) {
      this.unexpectedErrorHandler = e;
    }
    getUnexpectedErrorHandler() {
      return this.unexpectedErrorHandler;
    }
    onUnexpectedError(e) {
      this.unexpectedErrorHandler(e), this.emit(e);
    }
    onUnexpectedExternalError(e) {
      this.unexpectedErrorHandler(e);
    }
  };
  var pt = new Re2();
  function le(r11) {
    ft(r11) || pt.onUnexpectedError(r11);
  }
  var Ce = "Canceled";
  function ft(r11) {
    return r11 instanceof ee3 ? true : r11 instanceof Error && r11.name === Ce && r11.message === Ce;
  }
  var ee3 = class extends Error {
    constructor() {
      super(Ce), this.name = this.message;
    }
  };
  var ae = class r5 extends Error {
    constructor(e) {
      super(e), this.name = "CodeExpectedError";
    }
    static fromError(e) {
      if (e instanceof r5) return e;
      let t = new r5();
      return t.message = e.message, t.stack = e.stack, t;
    }
    static isErrorNoTelemetry(e) {
      return e.name === "CodeExpectedError";
    }
  };
  function mt(r11, e, t = 0, n = r11.length) {
    let i8 = t, s = n;
    for (; i8 < s; ) {
      let a = Math.floor((i8 + s) / 2);
      e(r11[a]) ? i8 = a + 1 : s = a;
    }
    return i8 - 1;
  }
  var ue2 = class ue3 {
    constructor(e) {
      this._array = e;
      this._findLastMonotonousLastIdx = 0;
    }
    findLastMonotonous(e) {
      if (ue3.assertInvariants) {
        if (this._prevFindLastPredicate) {
          for (let n of this._array) if (this._prevFindLastPredicate(n) && !e(n)) throw new Error("MonotonousArray: current predicate must be weaker than (or equal to) the previous predicate.");
        }
        this._prevFindLastPredicate = e;
      }
      let t = mt(this._array, e, this._findLastMonotonousLastIdx);
      return this._findLastMonotonousLastIdx = t + 1, t === -1 ? void 0 : this._array[t];
    }
  };
  ue2.assertInvariants = false;
  var Qe;
  ((h2) => {
    function r11(u) {
      return u < 0;
    }
    h2.isLessThan = r11;
    function e(u) {
      return u <= 0;
    }
    h2.isLessThanOrEqual = e;
    function t(u) {
      return u > 0;
    }
    h2.isGreaterThan = t;
    function n(u) {
      return u === 0;
    }
    h2.isNeitherLessOrGreaterThan = n, h2.greaterThan = 1, h2.lessThan = -1, h2.neitherLessOrGreaterThan = 0;
  })(Qe || (Qe = {}));
  function $e(r11, e) {
    return (t, n) => e(r11(t), r11(n));
  }
  var Be2 = (r11, e) => r11 - e;
  var V = class V2 {
    constructor(e) {
      this.iterate = e;
    }
    forEach(e) {
      this.iterate((t) => (e(t), true));
    }
    toArray() {
      let e = [];
      return this.iterate((t) => (e.push(t), true)), e;
    }
    filter(e) {
      return new V2((t) => this.iterate((n) => e(n) ? t(n) : true));
    }
    map(e) {
      return new V2((t) => this.iterate((n) => t(e(n))));
    }
    some(e) {
      let t = false;
      return this.iterate((n) => (t = e(n), !t)), t;
    }
    findFirst(e) {
      let t;
      return this.iterate((n) => e(n) ? (t = n, false) : true), t;
    }
    findLast(e) {
      let t;
      return this.iterate((n) => (e(n) && (t = n), true)), t;
    }
    findLastMaxBy(e) {
      let t, n = true;
      return this.iterate((i8) => ((n || Qe.isGreaterThan(e(i8, t))) && (n = false, t = i8), true)), t;
    }
  };
  V.empty = new V((e) => {
  });
  function Xe2(r11, e) {
    let t = /* @__PURE__ */ Object.create(null);
    for (let n of r11) {
      let i8 = e(n), s = t[i8];
      s || (s = t[i8] = []), s.push(n);
    }
    return t;
  }
  var Ye2;
  var Je2;
  var Ge2 = class {
    constructor(e, t) {
      this.toKey = t;
      this._map = /* @__PURE__ */ new Map();
      this[Ye2] = "SetWithKey";
      for (let n of e) this.add(n);
    }
    get size() {
      return this._map.size;
    }
    add(e) {
      let t = this.toKey(e);
      return this._map.set(t, e), this;
    }
    delete(e) {
      return this._map.delete(this.toKey(e));
    }
    has(e) {
      return this._map.has(this.toKey(e));
    }
    *entries() {
      for (let e of this._map.values()) yield [e, e];
    }
    keys() {
      return this.values();
    }
    *values() {
      for (let e of this._map.values()) yield e;
    }
    clear() {
      this._map.clear();
    }
    forEach(e, t) {
      this._map.forEach((n) => e.call(t, n, n, this));
    }
    [(Je2 = Symbol.iterator, Ye2 = Symbol.toStringTag, Je2)]() {
      return this.values();
    }
  };
  var ce2 = class {
    constructor() {
      this.map = /* @__PURE__ */ new Map();
    }
    add(e, t) {
      let n = this.map.get(e);
      n || (n = /* @__PURE__ */ new Set(), this.map.set(e, n)), n.add(t);
    }
    delete(e, t) {
      let n = this.map.get(e);
      n && (n.delete(t), n.size === 0 && this.map.delete(e));
    }
    forEach(e, t) {
      let n = this.map.get(e);
      n && n.forEach(t);
    }
    get(e) {
      let t = this.map.get(e);
      return t || /* @__PURE__ */ new Set();
    }
  };
  function Pe2(r11, e) {
    let t = this, n = false, i8;
    return function() {
      if (n) return i8;
      if (n = true, e) try {
        i8 = r11.apply(t, arguments);
      } finally {
        e();
      }
      else i8 = r11.apply(t, arguments);
      return i8;
    };
  }
  var Le2;
  ((z3) => {
    function r11(m) {
      return m && typeof m == "object" && typeof m[Symbol.iterator] == "function";
    }
    z3.is = r11;
    let e = Object.freeze([]);
    function t() {
      return e;
    }
    z3.empty = t;
    function* n(m) {
      yield m;
    }
    z3.single = n;
    function i8(m) {
      return r11(m) ? m : n(m);
    }
    z3.wrap = i8;
    function s(m) {
      return m || e;
    }
    z3.from = s;
    function* a(m) {
      for (let _4 = m.length - 1; _4 >= 0; _4--) yield m[_4];
    }
    z3.reverse = a;
    function h2(m) {
      return !m || m[Symbol.iterator]().next().done === true;
    }
    z3.isEmpty = h2;
    function u(m) {
      return m[Symbol.iterator]().next().value;
    }
    z3.first = u;
    function p(m, _4) {
      let y = 0;
      for (let L2 of m) if (_4(L2, y++)) return true;
      return false;
    }
    z3.some = p;
    function T2(m, _4) {
      for (let y of m) if (_4(y)) return y;
    }
    z3.find = T2;
    function* v3(m, _4) {
      for (let y of m) _4(y) && (yield y);
    }
    z3.filter = v3;
    function* I2(m, _4) {
      let y = 0;
      for (let L2 of m) yield _4(L2, y++);
    }
    z3.map = I2;
    function* E(m, _4) {
      let y = 0;
      for (let L2 of m) yield* _4(L2, y++);
    }
    z3.flatMap = E;
    function* S2(...m) {
      for (let _4 of m) yield* _4;
    }
    z3.concat = S2;
    function D2(m, _4, y) {
      let L2 = y;
      for (let X6 of m) L2 = _4(L2, X6);
      return L2;
    }
    z3.reduce = D2;
    function* x(m, _4, y = m.length) {
      for (_4 < 0 && (_4 += m.length), y < 0 ? y += m.length : y > m.length && (y = m.length); _4 < y; _4++) yield m[_4];
    }
    z3.slice = x;
    function J4(m, _4 = Number.POSITIVE_INFINITY) {
      let y = [];
      if (_4 === 0) return [y, m];
      let L2 = m[Symbol.iterator]();
      for (let X6 = 0; X6 < _4; X6++) {
        let Se2 = L2.next();
        if (Se2.done) return [y, z3.empty()];
        y.push(Se2.value);
      }
      return [y, { [Symbol.iterator]() {
        return L2;
      } }];
    }
    z3.consume = J4;
    async function q3(m) {
      let _4 = [];
      for await (let y of m) _4.push(y);
      return Promise.resolve(_4);
    }
    z3.asyncToArray = q3;
  })(Le2 || (Le2 = {}));
  var Tt = false;
  var K2 = null;
  var de2 = class de3 {
    constructor() {
      this.livingDisposables = /* @__PURE__ */ new Map();
    }
    getDisposableData(e) {
      let t = this.livingDisposables.get(e);
      return t || (t = { parent: null, source: null, isSingleton: false, value: e, idx: de3.idx++ }, this.livingDisposables.set(e, t)), t;
    }
    trackDisposable(e) {
      let t = this.getDisposableData(e);
      t.source || (t.source = new Error().stack);
    }
    setParent(e, t) {
      let n = this.getDisposableData(e);
      n.parent = t;
    }
    markAsDisposed(e) {
      this.livingDisposables.delete(e);
    }
    markAsSingleton(e) {
      this.getDisposableData(e).isSingleton = true;
    }
    getRootParent(e, t) {
      let n = t.get(e);
      if (n) return n;
      let i8 = e.parent ? this.getRootParent(this.getDisposableData(e.parent), t) : e;
      return t.set(e, i8), i8;
    }
    getTrackedDisposables() {
      let e = /* @__PURE__ */ new Map();
      return [...this.livingDisposables.entries()].filter(([, n]) => n.source !== null && !this.getRootParent(n, e).isSingleton).flatMap(([n]) => n);
    }
    computeLeakingDisposables(e = 10, t) {
      let n;
      if (t) n = t;
      else {
        let u = /* @__PURE__ */ new Map(), p = [...this.livingDisposables.values()].filter((v3) => v3.source !== null && !this.getRootParent(v3, u).isSingleton);
        if (p.length === 0) return;
        let T2 = new Set(p.map((v3) => v3.value));
        if (n = p.filter((v3) => !(v3.parent && T2.has(v3.parent))), n.length === 0) throw new Error("There are cyclic diposable chains!");
      }
      if (!n) return;
      function i8(u) {
        function p(v3, I2) {
          for (; v3.length > 0 && I2.some((E) => typeof E == "string" ? E === v3[0] : v3[0].match(E)); ) v3.shift();
        }
        let T2 = u.source.split(`
`).map((v3) => v3.trim().replace("at ", "")).filter((v3) => v3 !== "");
        return p(T2, ["Error", /^trackDisposable \(.*\)$/, /^DisposableTracker.trackDisposable \(.*\)$/]), T2.reverse();
      }
      let s = new ce2();
      for (let u of n) {
        let p = i8(u);
        for (let T2 = 0; T2 <= p.length; T2++) s.add(p.slice(0, T2).join(`
`), u);
      }
      n.sort($e((u) => u.idx, Be2));
      let a = "", h2 = 0;
      for (let u of n.slice(0, e)) {
        h2++;
        let p = i8(u), T2 = [];
        for (let v3 = 0; v3 < p.length; v3++) {
          let I2 = p[v3];
          I2 = `(shared with ${s.get(p.slice(0, v3 + 1).join(`
`)).size}/${n.length} leaks) at ${I2}`;
          let S2 = s.get(p.slice(0, v3).join(`
`)), D2 = Xe2([...S2].map((x) => i8(x)[v3]), (x) => x);
          delete D2[p[v3]];
          for (let [x, J4] of Object.entries(D2)) T2.unshift(`    - stacktraces of ${J4.length} other leaks continue with ${x}`);
          T2.unshift(I2);
        }
        a += `


==================== Leaking disposable ${h2}/${n.length}: ${u.value.constructor.name} ====================
${T2.join(`
`)}
============================================================

`;
      }
      return n.length > e && (a += `


... and ${n.length - e} more leaking disposables

`), { leaks: n, details: a };
    }
  };
  de2.idx = 0;
  function vt(r11) {
    K2 = r11;
  }
  if (Tt) {
    let r11 = "__is_disposable_tracked__";
    vt(new class {
      trackDisposable(e) {
        let t = new Error("Potentially leaked disposable").stack;
        setTimeout(() => {
          e[r11] || console.log(t);
        }, 3e3);
      }
      setParent(e, t) {
        if (e && e !== k2.None) try {
          e[r11] = true;
        } catch {
        }
      }
      markAsDisposed(e) {
        if (e && e !== k2.None) try {
          e[r11] = true;
        } catch {
        }
      }
      markAsSingleton(e) {
      }
    }());
  }
  function pe2(r11) {
    return K2?.trackDisposable(r11), r11;
  }
  function fe2(r11) {
    K2?.markAsDisposed(r11);
  }
  function te3(r11, e) {
    K2?.setParent(r11, e);
  }
  function bt(r11, e) {
    if (K2) for (let t of r11) K2.setParent(t, e);
  }
  function Q(r11) {
    if (Le2.is(r11)) {
      let e = [];
      for (let t of r11) if (t) try {
        t.dispose();
      } catch (n) {
        e.push(n);
      }
      if (e.length === 1) throw e[0];
      if (e.length > 1) throw new AggregateError(e, "Encountered errors while disposing of store");
      return Array.isArray(r11) ? [] : r11;
    } else if (r11) return r11.dispose(), r11;
  }
  function me2(...r11) {
    let e = A2(() => Q(r11));
    return bt(r11, e), e;
  }
  function A2(r11) {
    let e = pe2({ dispose: Pe2(() => {
      fe2(e), r11();
    }) });
    return e;
  }
  var he2 = class he3 {
    constructor() {
      this._toDispose = /* @__PURE__ */ new Set();
      this._isDisposed = false;
      pe2(this);
    }
    dispose() {
      this._isDisposed || (fe2(this), this._isDisposed = true, this.clear());
    }
    get isDisposed() {
      return this._isDisposed;
    }
    clear() {
      if (this._toDispose.size !== 0) try {
        Q(this._toDispose);
      } finally {
        this._toDispose.clear();
      }
    }
    add(e) {
      if (!e) return e;
      if (e === this) throw new Error("Cannot register a disposable on itself!");
      return te3(e, this), this._isDisposed ? he3.DISABLE_DISPOSED_WARNING || console.warn(new Error("Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!").stack) : this._toDispose.add(e), e;
    }
    delete(e) {
      if (e) {
        if (e === this) throw new Error("Cannot dispose a disposable on itself!");
        this._toDispose.delete(e), e.dispose();
      }
    }
    deleteAndLeak(e) {
      e && this._toDispose.has(e) && (this._toDispose.delete(e), te3(e, null));
    }
  };
  he2.DISABLE_DISPOSED_WARNING = false;
  var H2 = he2;
  var k2 = class {
    constructor() {
      this._store = new H2();
      pe2(this), te3(this._store, this);
    }
    dispose() {
      fe2(this), this._store.dispose();
    }
    _register(e) {
      if (e === this) throw new Error("Cannot register a disposable on itself!");
      return this._store.add(e);
    }
  };
  k2.None = Object.freeze({ dispose() {
  } });
  var F = class {
    constructor() {
      this._isDisposed = false;
      pe2(this);
    }
    get value() {
      return this._isDisposed ? void 0 : this._value;
    }
    set value(e) {
      this._isDisposed || e === this._value || (this._value?.dispose(), e && te3(e, this), this._value = e);
    }
    clear() {
      this.value = void 0;
    }
    dispose() {
      this._isDisposed = true, fe2(this), this._value?.dispose(), this._value = void 0;
    }
    clearAndLeak() {
      let e = this._value;
      return this._value = void 0, e && te3(e, null), e;
    }
  };
  var $ = class $2 {
    constructor(e) {
      this.element = e, this.next = $2.Undefined, this.prev = $2.Undefined;
    }
  };
  $.Undefined = new $(void 0);
  var _t = globalThis.performance && typeof globalThis.performance.now == "function";
  var Te2 = class r6 {
    static create(e) {
      return new r6(e);
    }
    constructor(e) {
      this._now = _t && e === false ? Date.now : globalThis.performance.now.bind(globalThis.performance), this._startTime = this._now(), this._stopTime = -1;
    }
    stop() {
      this._stopTime = this._now();
    }
    reset() {
      this._startTime = this._now(), this._stopTime = -1;
    }
    elapsed() {
      return this._stopTime !== -1 ? this._stopTime - this._startTime : this._now() - this._startTime;
    }
  };
  var gt = false;
  var tt2 = false;
  var yt = false;
  var ie3;
  ((re3) => {
    re3.None = () => k2.None;
    function e(d) {
      if (yt) {
        let { onDidAddListener: o2 } = d, c = ne2.create(), l2 = 0;
        d.onDidAddListener = () => {
          ++l2 === 2 && (console.warn("snapshotted emitter LIKELY used public and SHOULD HAVE BEEN created with DisposableStore. snapshotted here"), c.print()), o2?.();
        };
      }
    }
    function t(d, o2) {
      return I2(d, () => {
      }, 0, void 0, true, void 0, o2);
    }
    re3.defer = t;
    function n(d) {
      return (o2, c = null, l2) => {
        let f = false, b;
        return b = d((g2) => {
          if (!f) return b ? b.dispose() : f = true, o2.call(c, g2);
        }, null, l2), f && b.dispose(), b;
      };
    }
    re3.once = n;
    function i8(d, o2, c) {
      return T2((l2, f = null, b) => d((g2) => l2.call(f, o2(g2)), null, b), c);
    }
    re3.map = i8;
    function s(d, o2, c) {
      return T2((l2, f = null, b) => d((g2) => {
        o2(g2), l2.call(f, g2);
      }, null, b), c);
    }
    re3.forEach = s;
    function a(d, o2, c) {
      return T2((l2, f = null, b) => d((g2) => o2(g2) && l2.call(f, g2), null, b), c);
    }
    re3.filter = a;
    function h2(d) {
      return d;
    }
    re3.signal = h2;
    function u(...d) {
      return (o2, c = null, l2) => {
        let f = me2(...d.map((b) => b((g2) => o2.call(c, g2))));
        return v3(f, l2);
      };
    }
    re3.any = u;
    function p(d, o2, c, l2) {
      let f = c;
      return i8(d, (b) => (f = o2(f, b), f), l2);
    }
    re3.reduce = p;
    function T2(d, o2) {
      let c, l2 = { onWillAddFirstListener() {
        c = d(f.fire, f);
      }, onDidRemoveLastListener() {
        c?.dispose();
      } };
      o2 || e(l2);
      let f = new C2(l2);
      return o2?.add(f), f.event;
    }
    function v3(d, o2) {
      return o2 instanceof Array ? o2.push(d) : o2 && o2.add(d), d;
    }
    function I2(d, o2, c = 100, l2 = false, f = false, b, g2) {
      let w4, R3, U3, se3 = 0, Z5, Ve3 = { leakWarningThreshold: b, onWillAddFirstListener() {
        w4 = d((dt2) => {
          se3++, R3 = o2(R3, dt2), l2 && !U3 && (oe.fire(R3), R3 = void 0), Z5 = () => {
            let ht2 = R3;
            R3 = void 0, U3 = void 0, (!l2 || se3 > 1) && oe.fire(ht2), se3 = 0;
          }, typeof c == "number" ? (clearTimeout(U3), U3 = setTimeout(Z5, c)) : U3 === void 0 && (U3 = 0, queueMicrotask(Z5));
        });
      }, onWillRemoveListener() {
        f && se3 > 0 && Z5?.();
      }, onDidRemoveLastListener() {
        Z5 = void 0, w4.dispose();
      } };
      g2 || e(Ve3);
      let oe = new C2(Ve3);
      return g2?.add(oe), oe.event;
    }
    re3.debounce = I2;
    function E(d, o2 = 0, c) {
      return re3.debounce(d, (l2, f) => l2 ? (l2.push(f), l2) : [f], o2, void 0, true, void 0, c);
    }
    re3.accumulate = E;
    function S2(d, o2 = (l2, f) => l2 === f, c) {
      let l2 = true, f;
      return a(d, (b) => {
        let g2 = l2 || !o2(b, f);
        return l2 = false, f = b, g2;
      }, c);
    }
    re3.latch = S2;
    function D2(d, o2, c) {
      return [re3.filter(d, o2, c), re3.filter(d, (l2) => !o2(l2), c)];
    }
    re3.split = D2;
    function x(d, o2 = false, c = [], l2) {
      let f = c.slice(), b = d((R3) => {
        f ? f.push(R3) : w4.fire(R3);
      });
      l2 && l2.add(b);
      let g2 = () => {
        f?.forEach((R3) => w4.fire(R3)), f = null;
      }, w4 = new C2({ onWillAddFirstListener() {
        b || (b = d((R3) => w4.fire(R3)), l2 && l2.add(b));
      }, onDidAddFirstListener() {
        f && (o2 ? setTimeout(g2) : g2());
      }, onDidRemoveLastListener() {
        b && b.dispose(), b = null;
      } });
      return l2 && l2.add(w4), w4.event;
    }
    re3.buffer = x;
    function J4(d, o2) {
      return (l2, f, b) => {
        let g2 = o2(new z3());
        return d(function(w4) {
          let R3 = g2.evaluate(w4);
          R3 !== q3 && l2.call(f, R3);
        }, void 0, b);
      };
    }
    re3.chain = J4;
    let q3 = Symbol("HaltChainable");
    class z3 {
      constructor() {
        this.steps = [];
      }
      map(o2) {
        return this.steps.push(o2), this;
      }
      forEach(o2) {
        return this.steps.push((c) => (o2(c), c)), this;
      }
      filter(o2) {
        return this.steps.push((c) => o2(c) ? c : q3), this;
      }
      reduce(o2, c) {
        let l2 = c;
        return this.steps.push((f) => (l2 = o2(l2, f), l2)), this;
      }
      latch(o2 = (c, l2) => c === l2) {
        let c = true, l2;
        return this.steps.push((f) => {
          let b = c || !o2(f, l2);
          return c = false, l2 = f, b ? f : q3;
        }), this;
      }
      evaluate(o2) {
        for (let c of this.steps) if (o2 = c(o2), o2 === q3) break;
        return o2;
      }
    }
    function m(d, o2, c = (l2) => l2) {
      let l2 = (...w4) => g2.fire(c(...w4)), f = () => d.on(o2, l2), b = () => d.removeListener(o2, l2), g2 = new C2({ onWillAddFirstListener: f, onDidRemoveLastListener: b });
      return g2.event;
    }
    re3.fromNodeEventEmitter = m;
    function _4(d, o2, c = (l2) => l2) {
      let l2 = (...w4) => g2.fire(c(...w4)), f = () => d.addEventListener(o2, l2), b = () => d.removeEventListener(o2, l2), g2 = new C2({ onWillAddFirstListener: f, onDidRemoveLastListener: b });
      return g2.event;
    }
    re3.fromDOMEventEmitter = _4;
    function y(d) {
      return new Promise((o2) => n(d)(o2));
    }
    re3.toPromise = y;
    function L2(d) {
      let o2 = new C2();
      return d.then((c) => {
        o2.fire(c);
      }, () => {
        o2.fire(void 0);
      }).finally(() => {
        o2.dispose();
      }), o2.event;
    }
    re3.fromPromise = L2;
    function X6(d, o2) {
      return d((c) => o2.fire(c));
    }
    re3.forward = X6;
    function Se2(d, o2, c) {
      return o2(c), d((l2) => o2(l2));
    }
    re3.runAndSubscribe = Se2;
    class ct {
      constructor(o2, c) {
        this._observable = o2;
        this._counter = 0;
        this._hasChanged = false;
        let l2 = { onWillAddFirstListener: () => {
          o2.addObserver(this);
        }, onDidRemoveLastListener: () => {
          o2.removeObserver(this);
        } };
        c || e(l2), this.emitter = new C2(l2), c && c.add(this.emitter);
      }
      beginUpdate(o2) {
        this._counter++;
      }
      handlePossibleChange(o2) {
      }
      handleChange(o2, c) {
        this._hasChanged = true;
      }
      endUpdate(o2) {
        this._counter--, this._counter === 0 && (this._observable.reportChanges(), this._hasChanged && (this._hasChanged = false, this.emitter.fire(this._observable.get())));
      }
    }
    function zt2(d, o2) {
      return new ct(d, o2).emitter.event;
    }
    re3.fromObservable = zt2;
    function Ut2(d) {
      return (o2, c, l2) => {
        let f = 0, b = false, g2 = { beginUpdate() {
          f++;
        }, endUpdate() {
          f--, f === 0 && (d.reportChanges(), b && (b = false, o2.call(c)));
        }, handlePossibleChange() {
        }, handleChange() {
          b = true;
        } };
        d.addObserver(g2), d.reportChanges();
        let w4 = { dispose() {
          d.removeObserver(g2);
        } };
        return l2 instanceof H2 ? l2.add(w4) : Array.isArray(l2) && l2.push(w4), w4;
      };
    }
    re3.fromObservableLight = Ut2;
  })(ie3 || (ie3 = {}));
  var B = class B2 {
    constructor(e) {
      this.listenerCount = 0;
      this.invocationCount = 0;
      this.elapsedOverall = 0;
      this.durations = [];
      this.name = `${e}_${B2._idPool++}`, B2.all.add(this);
    }
    start(e) {
      this._stopWatch = new Te2(), this.listenerCount = e;
    }
    stop() {
      if (this._stopWatch) {
        let e = this._stopWatch.elapsed();
        this.durations.push(e), this.elapsedOverall += e, this.invocationCount += 1, this._stopWatch = void 0;
      }
    }
  };
  B.all = /* @__PURE__ */ new Set(), B._idPool = 0;
  var Oe2 = B;
  var nt2 = -1;
  var be2 = class be3 {
    constructor(e, t, n = (be3._idPool++).toString(16).padStart(3, "0")) {
      this._errorHandler = e;
      this.threshold = t;
      this.name = n;
      this._warnCountdown = 0;
    }
    dispose() {
      this._stacks?.clear();
    }
    check(e, t) {
      let n = this.threshold;
      if (n <= 0 || t < n) return;
      this._stacks || (this._stacks = /* @__PURE__ */ new Map());
      let i8 = this._stacks.get(e.value) || 0;
      if (this._stacks.set(e.value, i8 + 1), this._warnCountdown -= 1, this._warnCountdown <= 0) {
        this._warnCountdown = n * 0.5;
        let [s, a] = this.getMostFrequentStack(), h2 = `[${this.name}] potential listener LEAK detected, having ${t} listeners already. MOST frequent listener (${a}):`;
        console.warn(h2), console.warn(s);
        let u = new Me2(h2, s);
        this._errorHandler(u);
      }
      return () => {
        let s = this._stacks.get(e.value) || 0;
        this._stacks.set(e.value, s - 1);
      };
    }
    getMostFrequentStack() {
      if (!this._stacks) return;
      let e, t = 0;
      for (let [n, i8] of this._stacks) (!e || t < i8) && (e = [n, i8], t = i8);
      return e;
    }
  };
  be2._idPool = 1;
  var Ae2 = be2;
  var ne2 = class r7 {
    constructor(e) {
      this.value = e;
    }
    static create() {
      let e = new Error();
      return new r7(e.stack ?? "");
    }
    print() {
      console.warn(this.value.split(`
`).slice(2).join(`
`));
    }
  };
  var Me2 = class extends Error {
    constructor(e, t) {
      super(e), this.name = "ListenerLeakError", this.stack = t;
    }
  };
  var Fe2 = class extends Error {
    constructor(e, t) {
      super(e), this.name = "ListenerRefusalError", this.stack = t;
    }
  };
  var xt2 = 0;
  var G2 = class {
    constructor(e) {
      this.value = e;
      this.id = xt2++;
    }
  };
  var It = 2;
  var Dt = (r11, e) => {
    if (r11 instanceof G2) e(r11);
    else for (let t = 0; t < r11.length; t++) {
      let n = r11[t];
      n && e(n);
    }
  };
  var ve2;
  if (gt) {
    let r11 = [];
    setInterval(() => {
      r11.length !== 0 && (console.warn("[LEAKING LISTENERS] GC'ed these listeners that were NOT yet disposed:"), console.warn(r11.join(`
`)), r11.length = 0);
    }, 3e3), ve2 = new FinalizationRegistry((e) => {
      typeof e == "string" && r11.push(e);
    });
  }
  var C2 = class {
    constructor(e) {
      this._size = 0;
      this._options = e, this._leakageMon = nt2 > 0 || this._options?.leakWarningThreshold ? new Ae2(e?.onListenerError ?? le, this._options?.leakWarningThreshold ?? nt2) : void 0, this._perfMon = this._options?._profName ? new Oe2(this._options._profName) : void 0, this._deliveryQueue = this._options?.deliveryQueue;
    }
    dispose() {
      if (!this._disposed) {
        if (this._disposed = true, this._deliveryQueue?.current === this && this._deliveryQueue.reset(), this._listeners) {
          if (tt2) {
            let e = this._listeners;
            queueMicrotask(() => {
              Dt(e, (t) => t.stack?.print());
            });
          }
          this._listeners = void 0, this._size = 0;
        }
        this._options?.onDidRemoveLastListener?.(), this._leakageMon?.dispose();
      }
    }
    get event() {
      return this._event ?? (this._event = (e, t, n) => {
        if (this._leakageMon && this._size > this._leakageMon.threshold ** 2) {
          let u = `[${this._leakageMon.name}] REFUSES to accept new listeners because it exceeded its threshold by far (${this._size} vs ${this._leakageMon.threshold})`;
          console.warn(u);
          let p = this._leakageMon.getMostFrequentStack() ?? ["UNKNOWN stack", -1], T2 = new Fe2(`${u}. HINT: Stack shows most frequent listener (${p[1]}-times)`, p[0]);
          return (this._options?.onListenerError || le)(T2), k2.None;
        }
        if (this._disposed) return k2.None;
        t && (e = e.bind(t));
        let i8 = new G2(e), s, a;
        this._leakageMon && this._size >= Math.ceil(this._leakageMon.threshold * 0.2) && (i8.stack = ne2.create(), s = this._leakageMon.check(i8.stack, this._size + 1)), tt2 && (i8.stack = a ?? ne2.create()), this._listeners ? this._listeners instanceof G2 ? (this._deliveryQueue ?? (this._deliveryQueue = new Ne()), this._listeners = [this._listeners, i8]) : this._listeners.push(i8) : (this._options?.onWillAddFirstListener?.(this), this._listeners = i8, this._options?.onDidAddFirstListener?.(this)), this._size++;
        let h2 = A2(() => {
          ve2?.unregister(h2), s?.(), this._removeListener(i8);
        });
        if (n instanceof H2 ? n.add(h2) : Array.isArray(n) && n.push(h2), ve2) {
          let u = new Error().stack.split(`
`).slice(2, 3).join(`
`).trim(), p = /(file:|vscode-file:\/\/vscode-app)?(\/[^:]*:\d+:\d+)/.exec(u);
          ve2.register(h2, p?.[2] ?? u, h2);
        }
        return h2;
      }), this._event;
    }
    _removeListener(e) {
      if (this._options?.onWillRemoveListener?.(this), !this._listeners) return;
      if (this._size === 1) {
        this._listeners = void 0, this._options?.onDidRemoveLastListener?.(this), this._size = 0;
        return;
      }
      let t = this._listeners, n = t.indexOf(e);
      if (n === -1) throw console.log("disposed?", this._disposed), console.log("size?", this._size), console.log("arr?", JSON.stringify(this._listeners)), new Error("Attempted to dispose unknown listener");
      this._size--, t[n] = void 0;
      let i8 = this._deliveryQueue.current === this;
      if (this._size * It <= t.length) {
        let s = 0;
        for (let a = 0; a < t.length; a++) t[a] ? t[s++] = t[a] : i8 && (this._deliveryQueue.end--, s < this._deliveryQueue.i && this._deliveryQueue.i--);
        t.length = s;
      }
    }
    _deliver(e, t) {
      if (!e) return;
      let n = this._options?.onListenerError || le;
      if (!n) {
        e.value(t);
        return;
      }
      try {
        e.value(t);
      } catch (i8) {
        n(i8);
      }
    }
    _deliverQueue(e) {
      let t = e.current._listeners;
      for (; e.i < e.end; ) this._deliver(t[e.i++], e.value);
      e.reset();
    }
    fire(e) {
      if (this._deliveryQueue?.current && (this._deliverQueue(this._deliveryQueue), this._perfMon?.stop()), this._perfMon?.start(this._size), this._listeners) if (this._listeners instanceof G2) this._deliver(this._listeners, e);
      else {
        let t = this._deliveryQueue;
        t.enqueue(this, e, this._listeners.length), this._deliverQueue(t);
      }
      this._perfMon?.stop();
    }
    hasListeners() {
      return this._size > 0;
    }
  };
  var Ne = class {
    constructor() {
      this.i = -1;
      this.end = 0;
    }
    enqueue(e, t, n) {
      this.i = 0, this.end = n, this.current = e, this.value = t;
    }
    reset() {
      this.i = this.end, this.current = void 0, this.value = void 0;
    }
  };
  var it2 = Object.freeze(function(r11, e) {
    let t = setTimeout(r11.bind(e), 0);
    return { dispose() {
      clearTimeout(t);
    } };
  });
  var Et;
  ((n) => {
    function r11(i8) {
      return i8 === n.None || i8 === n.Cancelled || i8 instanceof We2 ? true : !i8 || typeof i8 != "object" ? false : typeof i8.isCancellationRequested == "boolean" && typeof i8.onCancellationRequested == "function";
    }
    n.isCancellationToken = r11, n.None = Object.freeze({ isCancellationRequested: false, onCancellationRequested: ie3.None }), n.Cancelled = Object.freeze({ isCancellationRequested: true, onCancellationRequested: it2 });
  })(Et || (Et = {}));
  var We2 = class {
    constructor() {
      this._isCancelled = false;
      this._emitter = null;
    }
    cancel() {
      this._isCancelled || (this._isCancelled = true, this._emitter && (this._emitter.fire(void 0), this.dispose()));
    }
    get isCancellationRequested() {
      return this._isCancelled;
    }
    get onCancellationRequested() {
      return this._isCancelled ? it2 : (this._emitter || (this._emitter = new C2()), this._emitter.event);
    }
    dispose() {
      this._emitter && (this._emitter.dispose(), this._emitter = null);
    }
  };
  var Y2 = "en";
  var qe2 = false;
  var ze = false;
  var ge2 = false;
  var wt = false;
  var kt = false;
  var st2 = false;
  var St = false;
  var Rt = false;
  var Ct = false;
  var Pt = false;
  var _e;
  var ye2 = Y2;
  var rt2 = Y2;
  var Lt;
  var N2;
  var W = globalThis;
  var O2;
  typeof W.vscode < "u" && typeof W.vscode.process < "u" ? O2 = W.vscode.process : typeof process < "u" && typeof process?.versions?.node == "string" && (O2 = process);
  var ot2 = typeof O2?.versions?.electron == "string";
  var Ot = ot2 && O2?.type === "renderer";
  if (typeof O2 == "object") {
    qe2 = O2.platform === "win32", ze = O2.platform === "darwin", ge2 = O2.platform === "linux", wt = ge2 && !!O2.env.SNAP && !!O2.env.SNAP_REVISION, St = ot2, Ct = !!O2.env.CI || !!O2.env.BUILD_ARTIFACTSTAGINGDIRECTORY, _e = Y2, ye2 = Y2;
    let r11 = O2.env.VSCODE_NLS_CONFIG;
    if (r11) try {
      let e = JSON.parse(r11);
      _e = e.userLocale, rt2 = e.osLocale, ye2 = e.resolvedLanguage || Y2, Lt = e.languagePack?.translationsConfigFile;
    } catch {
    }
    kt = true;
  } else typeof navigator == "object" && !Ot ? (N2 = navigator.userAgent, qe2 = N2.indexOf("Windows") >= 0, ze = N2.indexOf("Macintosh") >= 0, Rt = (N2.indexOf("Macintosh") >= 0 || N2.indexOf("iPad") >= 0 || N2.indexOf("iPhone") >= 0) && !!navigator.maxTouchPoints && navigator.maxTouchPoints > 0, ge2 = N2.indexOf("Linux") >= 0, Pt = N2?.indexOf("Mobi") >= 0, st2 = true, ye2 = globalThis._VSCODE_NLS_LANGUAGE || Y2, _e = navigator.language.toLowerCase(), rt2 = _e) : console.error("Unable to resolve platform.");
  var je2 = 0;
  ze ? je2 = 1 : qe2 ? je2 = 3 : ge2 && (je2 = 2);
  var At = st2 && typeof W.importScripts == "function";
  var gn = At ? W.origin : void 0;
  var M3 = N2;
  var j = ye2;
  var Mt;
  ((n) => {
    function r11() {
      return j;
    }
    n.value = r11;
    function e() {
      return j.length === 2 ? j === "en" : j.length >= 3 ? j[0] === "e" && j[1] === "n" && j[2] === "-" : false;
    }
    n.isDefaultVariant = e;
    function t() {
      return j === "en";
    }
    n.isDefault = t;
  })(Mt || (Mt = {}));
  var Ft = typeof W.postMessage == "function" && !W.importScripts;
  var at2 = (() => {
    if (Ft) {
      let r11 = [];
      W.addEventListener("message", (t) => {
        if (t.data && t.data.vscodeScheduleAsyncWork) for (let n = 0, i8 = r11.length; n < i8; n++) {
          let s = r11[n];
          if (s.id === t.data.vscodeScheduleAsyncWork) {
            r11.splice(n, 1), s.callback();
            return;
          }
        }
      });
      let e = 0;
      return (t) => {
        let n = ++e;
        r11.push({ id: n, callback: t }), W.postMessage({ vscodeScheduleAsyncWork: n }, "*");
      };
    }
    return (r11) => setTimeout(r11);
  })();
  var Nt = !!(M3 && M3.indexOf("Chrome") >= 0);
  var yn = !!(M3 && M3.indexOf("Firefox") >= 0);
  var xn = !!(!Nt && M3 && M3.indexOf("Safari") >= 0);
  var In = !!(M3 && M3.indexOf("Edg/") >= 0);
  var Dn = !!(M3 && M3.indexOf("Android") >= 0);
  var Wt = Symbol("MicrotaskDelay");
  function xe(r11, e = 0, t) {
    let n = setTimeout(() => {
      r11(), t && i8.dispose();
    }, e), i8 = A2(() => {
      clearTimeout(n), t?.deleteAndLeak(i8);
    });
    return t?.add(i8), i8;
  }
  var jt;
  var Ue;
  (function() {
    typeof globalThis.requestIdleCallback != "function" || typeof globalThis.cancelIdleCallback != "function" ? Ue = (r11, e) => {
      at2(() => {
        if (t) return;
        let n = Date.now() + 15;
        e(Object.freeze({ didTimeout: true, timeRemaining() {
          return Math.max(0, n - Date.now());
        } }));
      });
      let t = false;
      return { dispose() {
        t || (t = true);
      } };
    } : Ue = (r11, e, t) => {
      let n = r11.requestIdleCallback(e, typeof t == "number" ? { timeout: t } : void 0), i8 = false;
      return { dispose() {
        i8 || (i8 = true, r11.cancelIdleCallback(n));
      } };
    }, jt = (r11) => Ue(globalThis, r11);
  })();
  var qt;
  ((t) => {
    async function r11(n) {
      let i8, s = await Promise.all(n.map((a) => a.then((h2) => h2, (h2) => {
        i8 || (i8 = h2);
      })));
      if (typeof i8 < "u") throw i8;
      return s;
    }
    t.settled = r11;
    function e(n) {
      return new Promise(async (i8, s) => {
        try {
          await n(i8, s);
        } catch (a) {
          s(a);
        }
      });
    }
    t.withAsyncBody = e;
  })(qt || (qt = {}));
  var P3 = class P4 {
    static fromArray(e) {
      return new P4((t) => {
        t.emitMany(e);
      });
    }
    static fromPromise(e) {
      return new P4(async (t) => {
        t.emitMany(await e);
      });
    }
    static fromPromises(e) {
      return new P4(async (t) => {
        await Promise.all(e.map(async (n) => t.emitOne(await n)));
      });
    }
    static merge(e) {
      return new P4(async (t) => {
        await Promise.all(e.map(async (n) => {
          for await (let i8 of n) t.emitOne(i8);
        }));
      });
    }
    constructor(e, t) {
      this._state = 0, this._results = [], this._error = null, this._onReturn = t, this._onStateChanged = new C2(), queueMicrotask(async () => {
        let n = { emitOne: (i8) => this.emitOne(i8), emitMany: (i8) => this.emitMany(i8), reject: (i8) => this.reject(i8) };
        try {
          await Promise.resolve(e(n)), this.resolve();
        } catch (i8) {
          this.reject(i8);
        } finally {
          n.emitOne = void 0, n.emitMany = void 0, n.reject = void 0;
        }
      });
    }
    [Symbol.asyncIterator]() {
      let e = 0;
      return { next: async () => {
        do {
          if (this._state === 2) throw this._error;
          if (e < this._results.length) return { done: false, value: this._results[e++] };
          if (this._state === 1) return { done: true, value: void 0 };
          await ie3.toPromise(this._onStateChanged.event);
        } while (true);
      }, return: async () => (this._onReturn?.(), { done: true, value: void 0 }) };
    }
    static map(e, t) {
      return new P4(async (n) => {
        for await (let i8 of e) n.emitOne(t(i8));
      });
    }
    map(e) {
      return P4.map(this, e);
    }
    static filter(e, t) {
      return new P4(async (n) => {
        for await (let i8 of e) t(i8) && n.emitOne(i8);
      });
    }
    filter(e) {
      return P4.filter(this, e);
    }
    static coalesce(e) {
      return P4.filter(e, (t) => !!t);
    }
    coalesce() {
      return P4.coalesce(this);
    }
    static async toPromise(e) {
      let t = [];
      for await (let n of e) t.push(n);
      return t;
    }
    toPromise() {
      return P4.toPromise(this);
    }
    emitOne(e) {
      this._state === 0 && (this._results.push(e), this._onStateChanged.fire());
    }
    emitMany(e) {
      this._state === 0 && (this._results = this._results.concat(e), this._onStateChanged.fire());
    }
    resolve() {
      this._state === 0 && (this._state = 1, this._onStateChanged.fire());
    }
    reject(e) {
      this._state === 0 && (this._state = 2, this._error = e, this._onStateChanged.fire());
    }
  };
  P3.EMPTY = P3.fromArray([]);
  var Ie = class extends k2 {
    constructor(t) {
      super();
      this._terminal = t;
      this._linesCacheTimeout = this._register(new F());
      this._linesCacheDisposables = this._register(new F());
      this._register(A2(() => this._destroyLinesCache()));
    }
    initLinesCache() {
      this._linesCache || (this._linesCache = new Array(this._terminal.buffer.active.length), this._linesCacheDisposables.value = me2(this._terminal.onLineFeed(() => this._destroyLinesCache()), this._terminal.onCursorMove(() => this._destroyLinesCache()), this._terminal.onResize(() => this._destroyLinesCache()))), this._linesCacheTimeout.value = xe(() => this._destroyLinesCache(), 15e3);
    }
    _destroyLinesCache() {
      this._linesCache = void 0, this._linesCacheDisposables.clear(), this._linesCacheTimeout.clear();
    }
    getLineFromCache(t) {
      return this._linesCache?.[t];
    }
    setLineInCache(t, n) {
      this._linesCache && (this._linesCache[t] = n);
    }
    translateBufferLineToStringWithWrap(t, n) {
      let i8 = [], s = [0], a = this._terminal.buffer.active.getLine(t);
      for (; a; ) {
        let h2 = this._terminal.buffer.active.getLine(t + 1), u = h2 ? h2.isWrapped : false, p = a.translateToString(!u && n);
        if (u && h2) {
          let T2 = a.getCell(a.length - 1);
          T2 && T2.getCode() === 0 && T2.getWidth() === 1 && h2.getCell(0)?.getWidth() === 2 && (p = p.slice(0, -1));
        }
        if (i8.push(p), u) s.push(s[s.length - 1] + p.length);
        else break;
        t++, a = h2;
      }
      return [i8.join(""), s];
    }
  };
  var De2 = class {
    get cachedSearchTerm() {
      return this._cachedSearchTerm;
    }
    set cachedSearchTerm(e) {
      this._cachedSearchTerm = e;
    }
    get lastSearchOptions() {
      return this._lastSearchOptions;
    }
    set lastSearchOptions(e) {
      this._lastSearchOptions = e;
    }
    isValidSearchTerm(e) {
      return !!(e && e.length > 0);
    }
    didOptionsChange(e) {
      return this._lastSearchOptions ? e ? this._lastSearchOptions.caseSensitive !== e.caseSensitive || this._lastSearchOptions.regex !== e.regex || this._lastSearchOptions.wholeWord !== e.wholeWord : false : true;
    }
    shouldUpdateHighlighting(e, t) {
      return t?.decorations ? this._cachedSearchTerm === void 0 || e !== this._cachedSearchTerm || this.didOptionsChange(t) : false;
    }
    clearCachedTerm() {
      this._cachedSearchTerm = void 0;
    }
    reset() {
      this._cachedSearchTerm = void 0, this._lastSearchOptions = void 0;
    }
  };
  var Ee2 = class {
    constructor(e, t) {
      this._terminal = e;
      this._lineCache = t;
    }
    find(e, t, n, i8) {
      if (!e || e.length === 0) {
        this._terminal.clearSelection();
        return;
      }
      if (n > this._terminal.cols) throw new Error(`Invalid col: ${n} to search in terminal of ${this._terminal.cols} cols`);
      this._lineCache.initLinesCache();
      let s = { startRow: t, startCol: n }, a = this._findInLine(e, s, i8);
      if (!a) for (let h2 = t + 1; h2 < this._terminal.buffer.active.baseY + this._terminal.rows && (s.startRow = h2, s.startCol = 0, a = this._findInLine(e, s, i8), !a); h2++) ;
      return a;
    }
    findNextWithSelection(e, t, n) {
      if (!e || e.length === 0) {
        this._terminal.clearSelection();
        return;
      }
      let i8 = this._terminal.getSelectionPosition();
      this._terminal.clearSelection();
      let s = 0, a = 0;
      i8 && (n === e ? (s = i8.end.x, a = i8.end.y) : (s = i8.start.x, a = i8.start.y)), this._lineCache.initLinesCache();
      let h2 = { startRow: a, startCol: s }, u = this._findInLine(e, h2, t);
      if (!u) for (let p = a + 1; p < this._terminal.buffer.active.baseY + this._terminal.rows && (h2.startRow = p, h2.startCol = 0, u = this._findInLine(e, h2, t), !u); p++) ;
      if (!u && a !== 0) for (let p = 0; p < a && (h2.startRow = p, h2.startCol = 0, u = this._findInLine(e, h2, t), !u); p++) ;
      return !u && i8 && (h2.startRow = i8.start.y, h2.startCol = 0, u = this._findInLine(e, h2, t)), u;
    }
    findPreviousWithSelection(e, t, n) {
      if (!e || e.length === 0) {
        this._terminal.clearSelection();
        return;
      }
      let i8 = this._terminal.getSelectionPosition();
      this._terminal.clearSelection();
      let s = this._terminal.buffer.active.baseY + this._terminal.rows - 1, a = this._terminal.cols, h2 = true;
      this._lineCache.initLinesCache();
      let u = { startRow: s, startCol: a }, p;
      if (i8 && (u.startRow = s = i8.start.y, u.startCol = a = i8.start.x, n !== e && (p = this._findInLine(e, u, t, false), p || (u.startRow = s = i8.end.y, u.startCol = a = i8.end.x))), p || (p = this._findInLine(e, u, t, h2)), !p) {
        u.startCol = Math.max(u.startCol, this._terminal.cols);
        for (let T2 = s - 1; T2 >= 0 && (u.startRow = T2, p = this._findInLine(e, u, t, h2), !p); T2--) ;
      }
      if (!p && s !== this._terminal.buffer.active.baseY + this._terminal.rows - 1) for (let T2 = this._terminal.buffer.active.baseY + this._terminal.rows - 1; T2 >= s && (u.startRow = T2, p = this._findInLine(e, u, t, h2), !p); T2--) ;
      return p;
    }
    _isWholeWord(e, t, n) {
      return (e === 0 || " ~!@#$%^&*()+`-=[]{}|\\;:\"',./<>?".includes(t[e - 1])) && (e + n.length === t.length || " ~!@#$%^&*()+`-=[]{}|\\;:\"',./<>?".includes(t[e + n.length]));
    }
    _findInLine(e, t, n = {}, i8 = false) {
      let s = t.startRow, a = t.startCol;
      if (this._terminal.buffer.active.getLine(s)?.isWrapped) {
        if (i8) {
          t.startCol += this._terminal.cols;
          return;
        }
        return t.startRow--, t.startCol += this._terminal.cols, this._findInLine(e, t, n);
      }
      let u = this._lineCache.getLineFromCache(s);
      u || (u = this._lineCache.translateBufferLineToStringWithWrap(s, true), this._lineCache.setLineInCache(s, u));
      let [p, T2] = u, v3 = this._bufferColsToStringOffset(s, a), I2 = e, E = p;
      n.regex || (I2 = n.caseSensitive ? e : e.toLowerCase(), E = n.caseSensitive ? p : p.toLowerCase());
      let S2 = -1;
      if (n.regex) {
        let D2 = RegExp(I2, n.caseSensitive ? "g" : "gi"), x;
        if (i8) for (; x = D2.exec(E.slice(0, v3)); ) S2 = D2.lastIndex - x[0].length, e = x[0], D2.lastIndex -= e.length - 1;
        else x = D2.exec(E.slice(v3)), x && x[0].length > 0 && (S2 = v3 + (D2.lastIndex - x[0].length), e = x[0]);
      } else i8 ? v3 - I2.length >= 0 && (S2 = E.lastIndexOf(I2, v3 - I2.length)) : S2 = E.indexOf(I2, v3);
      if (S2 >= 0) {
        if (n.wholeWord && !this._isWholeWord(S2, E, e)) return;
        let D2 = 0;
        for (; D2 < T2.length - 1 && S2 >= T2[D2 + 1]; ) D2++;
        let x = D2;
        for (; x < T2.length - 1 && S2 + e.length >= T2[x + 1]; ) x++;
        let J4 = S2 - T2[D2], q3 = S2 + e.length - T2[x], z3 = this._stringLengthToBufferSize(s + D2, J4), _4 = this._stringLengthToBufferSize(s + x, q3) - z3 + this._terminal.cols * (x - D2);
        return { term: e, col: z3, row: s + D2, size: _4 };
      }
    }
    _stringLengthToBufferSize(e, t) {
      let n = this._terminal.buffer.active.getLine(e);
      if (!n) return 0;
      for (let i8 = 0; i8 < t; i8++) {
        let s = n.getCell(i8);
        if (!s) break;
        let a = s.getChars();
        a.length > 1 && (t -= a.length - 1);
        let h2 = n.getCell(i8 + 1);
        h2 && h2.getWidth() === 0 && t++;
      }
      return t;
    }
    _bufferColsToStringOffset(e, t) {
      let n = e, i8 = 0, s = this._terminal.buffer.active.getLine(n);
      for (; t > 0 && s; ) {
        for (let a = 0; a < t && a < this._terminal.cols; a++) {
          let h2 = s.getCell(a);
          if (!h2) break;
          h2.getWidth() && (i8 += h2.getCode() === 0 ? 1 : h2.getChars().length);
        }
        if (n++, s = this._terminal.buffer.active.getLine(n), s && !s.isWrapped) break;
        t -= this._terminal.cols;
      }
      return i8;
    }
  };
  var we2 = class extends k2 {
    constructor(t) {
      super();
      this._terminal = t;
      this._highlightDecorations = [];
      this._highlightedLines = /* @__PURE__ */ new Set();
      this._register(A2(() => this.clearHighlightDecorations()));
    }
    createHighlightDecorations(t, n) {
      this.clearHighlightDecorations();
      for (let i8 of t) {
        let s = this._createResultDecorations(i8, n, false);
        if (s) for (let a of s) this._storeDecoration(a, i8);
      }
    }
    createActiveDecoration(t, n) {
      let i8 = this._createResultDecorations(t, n, true);
      if (i8) return { decorations: i8, match: t, dispose() {
        Q(i8);
      } };
    }
    clearHighlightDecorations() {
      Q(this._highlightDecorations), this._highlightDecorations = [], this._highlightedLines.clear();
    }
    _storeDecoration(t, n) {
      this._highlightedLines.add(t.marker.line), this._highlightDecorations.push({ decoration: t, match: n, dispose() {
        t.dispose();
      } });
    }
    _applyStyles(t, n, i8) {
      t.classList.contains("xterm-find-result-decoration") || (t.classList.add("xterm-find-result-decoration"), n && (t.style.outline = `1px solid ${n}`)), i8 && t.classList.add("xterm-find-active-result-decoration");
    }
    _createResultDecorations(t, n, i8) {
      let s = [], a = t.col, h2 = t.size, u = -this._terminal.buffer.active.baseY - this._terminal.buffer.active.cursorY + t.row;
      for (; h2 > 0; ) {
        let T2 = Math.min(this._terminal.cols - a, h2);
        s.push([u, a, T2]), a = 0, h2 -= T2, u++;
      }
      let p = [];
      for (let T2 of s) {
        let v3 = this._terminal.registerMarker(T2[0]), I2 = this._terminal.registerDecoration({ marker: v3, x: T2[1], width: T2[2], backgroundColor: i8 ? n.activeMatchBackground : n.matchBackground, overviewRulerOptions: this._highlightedLines.has(v3.line) ? void 0 : { color: i8 ? n.activeMatchColorOverviewRuler : n.matchOverviewRuler, position: "center" } });
        if (I2) {
          let E = [];
          E.push(v3), E.push(I2.onRender((S2) => this._applyStyles(S2, i8 ? n.activeMatchBorder : n.matchBorder, false))), E.push(I2.onDispose(() => Q(E))), p.push(I2);
        }
      }
      return p.length === 0 ? void 0 : p;
    }
  };
  var ke2 = class extends k2 {
    constructor() {
      super(...arguments);
      this._searchResults = [];
      this._onDidChangeResults = this._register(new C2());
    }
    get onDidChangeResults() {
      return this._onDidChangeResults.event;
    }
    get searchResults() {
      return this._searchResults;
    }
    get selectedDecoration() {
      return this._selectedDecoration;
    }
    set selectedDecoration(t) {
      this._selectedDecoration = t;
    }
    updateResults(t, n) {
      this._searchResults = t.slice(0, n);
    }
    clearResults() {
      this._searchResults = [];
    }
    clearSelectedDecoration() {
      this._selectedDecoration && (this._selectedDecoration.dispose(), this._selectedDecoration = void 0);
    }
    findResultIndex(t) {
      for (let n = 0; n < this._searchResults.length; n++) {
        let i8 = this._searchResults[n];
        if (i8.row === t.row && i8.col === t.col && i8.size === t.size) return n;
      }
      return -1;
    }
    fireResultsChanged(t) {
      if (!t) return;
      let n = -1;
      this._selectedDecoration && (n = this.findResultIndex(this._selectedDecoration.match)), this._onDidChangeResults.fire({ resultIndex: n, resultCount: this._searchResults.length });
    }
    reset() {
      this.clearSelectedDecoration(), this.clearResults();
    }
  };
  var ut = class extends k2 {
    constructor(t) {
      super();
      this._highlightTimeout = this._register(new F());
      this._lineCache = this._register(new F());
      this._state = new De2();
      this._resultTracker = this._register(new ke2());
      this._highlightLimit = t?.highlightLimit ?? 1e3;
    }
    get onDidChangeResults() {
      return this._resultTracker.onDidChangeResults;
    }
    activate(t) {
      this._terminal = t, this._lineCache.value = new Ie(t), this._engine = new Ee2(t, this._lineCache.value), this._decorationManager = new we2(t), this._register(this._terminal.onWriteParsed(() => this._updateMatches())), this._register(this._terminal.onResize(() => this._updateMatches())), this._register(A2(() => this.clearDecorations()));
    }
    _updateMatches() {
      this._highlightTimeout.clear(), this._state.cachedSearchTerm && this._state.lastSearchOptions?.decorations && (this._highlightTimeout.value = xe(() => {
        let t = this._state.cachedSearchTerm;
        this._state.clearCachedTerm(), this.findPrevious(t, { ...this._state.lastSearchOptions, incremental: true }, { noScroll: true });
      }, 200));
    }
    clearDecorations(t) {
      this._resultTracker.clearSelectedDecoration(), this._decorationManager?.clearHighlightDecorations(), this._resultTracker.clearResults(), t || this._state.clearCachedTerm();
    }
    clearActiveDecoration() {
      this._resultTracker.clearSelectedDecoration();
    }
    findNext(t, n, i8) {
      if (!this._terminal || !this._engine) throw new Error("Cannot use addon until it has been loaded");
      this._state.lastSearchOptions = n, this._state.shouldUpdateHighlighting(t, n) && this._highlightAllMatches(t, n);
      let s = this._findNextAndSelect(t, n, i8);
      return this._fireResults(n), this._state.cachedSearchTerm = t, s;
    }
    _highlightAllMatches(t, n) {
      if (!this._terminal || !this._engine || !this._decorationManager) throw new Error("Cannot use addon until it has been loaded");
      if (!this._state.isValidSearchTerm(t)) {
        this.clearDecorations();
        return;
      }
      this.clearDecorations(true);
      let i8 = [], s, a = this._engine.find(t, 0, 0, n);
      for (; a && (s?.row !== a.row || s?.col !== a.col) && !(i8.length >= this._highlightLimit); ) s = a, i8.push(s), a = this._engine.find(t, s.col + s.term.length >= this._terminal.cols ? s.row + 1 : s.row, s.col + s.term.length >= this._terminal.cols ? 0 : s.col + 1, n);
      this._resultTracker.updateResults(i8, this._highlightLimit), n.decorations && this._decorationManager.createHighlightDecorations(i8, n.decorations);
    }
    _findNextAndSelect(t, n, i8) {
      if (!this._terminal || !this._engine) return false;
      if (!this._state.isValidSearchTerm(t)) return this._terminal.clearSelection(), this.clearDecorations(), false;
      let s = this._engine.findNextWithSelection(t, n, this._state.cachedSearchTerm);
      return this._selectResult(s, n?.decorations, i8?.noScroll);
    }
    findPrevious(t, n, i8) {
      if (!this._terminal || !this._engine) throw new Error("Cannot use addon until it has been loaded");
      this._state.lastSearchOptions = n, this._state.shouldUpdateHighlighting(t, n) && this._highlightAllMatches(t, n);
      let s = this._findPreviousAndSelect(t, n, i8);
      return this._fireResults(n), this._state.cachedSearchTerm = t, s;
    }
    _fireResults(t) {
      this._resultTracker.fireResultsChanged(!!t?.decorations);
    }
    _findPreviousAndSelect(t, n, i8) {
      if (!this._terminal || !this._engine) return false;
      if (!this._state.isValidSearchTerm(t)) return this._terminal.clearSelection(), this.clearDecorations(), false;
      let s = this._engine.findPreviousWithSelection(t, n, this._state.cachedSearchTerm);
      return this._selectResult(s, n?.decorations, i8?.noScroll);
    }
    _selectResult(t, n, i8) {
      if (!this._terminal || !this._decorationManager) return false;
      if (this._resultTracker.clearSelectedDecoration(), !t) return this._terminal.clearSelection(), false;
      if (this._terminal.select(t.col, t.row, t.size), n) {
        let s = this._decorationManager.createActiveDecoration(t, n);
        s && (this._resultTracker.selectedDecoration = s);
      }
      if (!i8 && (t.row >= this._terminal.buffer.active.viewportY + this._terminal.rows || t.row < this._terminal.buffer.active.viewportY)) {
        let s = t.row - this._terminal.buffer.active.viewportY;
        s -= Math.floor(this._terminal.rows / 2), this._terminal.scrollLines(s);
      }
      return true;
    }
  };

  // node_modules/@xterm/addon-image/lib/addon-image.mjs
  var st3 = Object.create;
  var be4 = Object.defineProperty;
  var nt3 = Object.getOwnPropertyDescriptor;
  var At2 = Object.getOwnPropertyNames;
  var ot3 = Object.getPrototypeOf;
  var at3 = Object.prototype.hasOwnProperty;
  var N3 = (r11, e) => () => (e || r11((e = { exports: {} }).exports, e), e.exports);
  var lt2 = (r11, e, t, i8) => {
    if (e && typeof e == "object" || typeof e == "function") for (let s of At2(e)) !at3.call(r11, s) && s !== t && be4(r11, s, { get: () => e[s], enumerable: !(i8 = nt3(e, s)) || i8.enumerable });
    return r11;
  };
  var Y3 = (r11, e, t) => (t = r11 != null ? st3(ot3(r11)) : {}, lt2(e || !r11 || !r11.__esModule ? be4(t, "default", { value: r11, enumerable: true }) : t, r11));
  var W2 = N3((u) => {
    "use strict";
    Object.defineProperty(u, "__esModule", { value: true });
    u.DEFAULT_FOREGROUND = u.DEFAULT_BACKGROUND = u.PALETTE_ANSI_256 = u.PALETTE_VT340_GREY = u.PALETTE_VT340_COLOR = u.normalizeHLS = u.normalizeRGB = u.nearestColorIndex = u.fromRGBA8888 = u.toRGBA8888 = u.alpha = u.blue = u.green = u.red = u.BIG_ENDIAN = void 0;
    u.BIG_ENDIAN = new Uint8Array(new Uint32Array([4278190080]).buffer)[0] === 255;
    u.BIG_ENDIAN && console.warn("BE platform detected. This version of node-sixel works only on LE properly.");
    function we3(r11) {
      return r11 & 255;
    }
    u.red = we3;
    function xe3(r11) {
      return r11 >>> 8 & 255;
    }
    u.green = xe3;
    function ye4(r11) {
      return r11 >>> 16 & 255;
    }
    u.blue = ye4;
    function ct(r11) {
      return r11 >>> 24 & 255;
    }
    u.alpha = ct;
    function m(r11, e, t, i8 = 255) {
      return ((i8 & 255) << 24 | (t & 255) << 16 | (e & 255) << 8 | r11 & 255) >>> 0;
    }
    u.toRGBA8888 = m;
    function dt2(r11) {
      return [r11 & 255, r11 >> 8 & 255, r11 >> 16 & 255, r11 >>> 24];
    }
    u.fromRGBA8888 = dt2;
    function ht2(r11, e) {
      let t = we3(r11), i8 = xe3(r11), s = ye4(r11), n = Number.MAX_SAFE_INTEGER, A3 = -1;
      for (let o2 = 0; o2 < e.length; ++o2) {
        let a = t - e[o2][0], c = i8 - e[o2][1], h2 = s - e[o2][2], l2 = a * a + c * c + h2 * h2;
        if (!l2) return o2;
        l2 < n && (n = l2, A3 = o2);
      }
      return A3;
    }
    u.nearestColorIndex = ht2;
    function de4(r11, e, t) {
      return Math.max(r11, Math.min(t, e));
    }
    function he5(r11, e, t) {
      return t < 0 && (t += 1), t > 1 && (t -= 1), t * 6 < 1 ? e + (r11 - e) * 6 * t : t * 2 < 1 ? r11 : t * 3 < 2 ? e + (r11 - e) * (4 - t * 6) : e;
    }
    function gt4(r11, e, t) {
      if (!t) {
        let n = Math.round(e * 255);
        return m(n, n, n);
      }
      let i8 = e < 0.5 ? e * (1 + t) : e + t - e * t, s = 2 * e - i8;
      return m(de4(0, 255, Math.round(he5(i8, s, r11 + 1 / 3) * 255)), de4(0, 255, Math.round(he5(i8, s, r11) * 255)), de4(0, 255, Math.round(he5(i8, s, r11 - 1 / 3) * 255)));
    }
    function g2(r11, e, t) {
      return (4278190080 | Math.round(t / 100 * 255) << 16 | Math.round(e / 100 * 255) << 8 | Math.round(r11 / 100 * 255)) >>> 0;
    }
    u.normalizeRGB = g2;
    function ut3(r11, e, t) {
      return gt4((r11 + 240 % 360) / 360, e / 100, t / 100);
    }
    u.normalizeHLS = ut3;
    u.PALETTE_VT340_COLOR = new Uint32Array([g2(0, 0, 0), g2(20, 20, 80), g2(80, 13, 13), g2(20, 80, 20), g2(80, 20, 80), g2(20, 80, 80), g2(80, 80, 20), g2(53, 53, 53), g2(26, 26, 26), g2(33, 33, 60), g2(60, 26, 26), g2(33, 60, 33), g2(60, 33, 60), g2(33, 60, 60), g2(60, 60, 33), g2(80, 80, 80)]);
    u.PALETTE_VT340_GREY = new Uint32Array([g2(0, 0, 0), g2(13, 13, 13), g2(26, 26, 26), g2(40, 40, 40), g2(6, 6, 6), g2(20, 20, 20), g2(33, 33, 33), g2(46, 46, 46), g2(0, 0, 0), g2(13, 13, 13), g2(26, 26, 26), g2(40, 40, 40), g2(6, 6, 6), g2(20, 20, 20), g2(33, 33, 33), g2(46, 46, 46)]);
    u.PALETTE_ANSI_256 = (() => {
      let r11 = [m(0, 0, 0), m(205, 0, 0), m(0, 205, 0), m(205, 205, 0), m(0, 0, 238), m(205, 0, 205), m(0, 250, 205), m(229, 229, 229), m(127, 127, 127), m(255, 0, 0), m(0, 255, 0), m(255, 255, 0), m(92, 92, 255), m(255, 0, 255), m(0, 255, 255), m(255, 255, 255)], e = [0, 95, 135, 175, 215, 255];
      for (let t = 0; t < 6; ++t) for (let i8 = 0; i8 < 6; ++i8) for (let s = 0; s < 6; ++s) r11.push(m(e[t], e[i8], e[s]));
      for (let t = 8; t <= 238; t += 10) r11.push(m(t, t, t));
      return new Uint32Array(r11);
    })();
    u.DEFAULT_BACKGROUND = m(0, 0, 0, 255);
    u.DEFAULT_FOREGROUND = m(255, 255, 255, 255);
  });
  var Ke2 = N3((re3) => {
    "use strict";
    Object.defineProperty(re3, "__esModule", { value: true });
    re3.InWasm = void 0;
    function R3(r11) {
      if (typeof Buffer < "u") return Buffer.from(r11, "base64");
      let e = atob(r11), t = new Uint8Array(e.length);
      for (let i8 = 0; i8 < t.length; ++i8) t[i8] = e.charCodeAt(i8);
      return t;
    }
    function Tt3(r11) {
      if (r11.d) {
        let { t: e, s: t, d: i8 } = r11, s, n, A3 = WebAssembly;
        return e === 2 ? t ? () => s || (s = R3(i8)) : () => Promise.resolve(s || (s = R3(i8))) : e === 1 ? t ? () => n || (n = new A3.Module(s || (s = R3(i8)))) : () => n ? Promise.resolve(n) : A3.compile(s || (s = R3(i8))).then((o2) => n = o2) : t ? (o2) => new A3.Instance(n || (n = new A3.Module(s || (s = R3(i8)))), o2) : (o2) => n ? A3.instantiate(n, o2) : A3.instantiate(s || (s = R3(i8)), o2).then((a) => (n = a.module) && a.instance);
      }
      if (typeof _wasmCtx > "u") throw new Error('must run "inwasm"');
      _wasmCtx.add(r11);
    }
    re3.InWasm = Tt3;
  });
  var Oe3 = N3((Ce3) => {
    "use strict";
    Object.defineProperty(Ce3, "__esModule", { value: true });
    var bt3 = Ke2(), wt3 = (0, bt3.InWasm)({ s: 1, t: 0, d: "AGFzbQEAAAABBQFgAAF/Ag8BA2VudgZtZW1vcnkCAAEDAwIAAAcNAgNkZWMAAANlbmQAAQqxAwKuAQEFf0GIKCgCAEGgKGohAUGEKCgCACIAQYAoKAIAQQFrQXxxIgJIBEAgAkGgKGohAyAAQaAoaiEAA0AgAC0AA0ECdCgCgCAgAC0AAkECdCgCgBggAC0AAUECdCgCgBAgAC0AAEECdCgCgAhycnIiBEH///8HSwRAQQEPCyABIAQ2AgAgAUEDaiEBIABBBGoiACADSQ0ACwtBhCggAjYCAEGIKCABQaAoazYCAEEAC/4BAQZ/AkBBgCgoAgAiAUGEKCgCACIAa0EFTgRAQQEhAxAADQFBgCgoAgAhAUGEKCgCACEAC0EBIQMgASAAayIEQQJIDQAgAEGhKGotAABBAnQoAoAQIABBoChqLQAAQQJ0KAKACHIhAQJAIARBAkYEQEEBIQIMAQtBASECIAAtAKIoIgVBPUcEQEECIQIgBUECdCgCgBggAXIhAQsgBEEERw0AIAAtAKMoIgBBPUYNACACQQFqIQIgAEECdCgCgCAgAXIhAQsgAUH///8HSw0AQYgoKAIAQaAoaiABNgIAQYgoQYgoKAIAIAJqIgA2AgAgAEGQKCgCAEchAwsgAwsAdglwcm9kdWNlcnMBDHByb2Nlc3NlZC1ieQEFY2xhbmdWMTguMC4wIChodHRwczovL2dpdGh1Yi5jb20vbGx2bS9sbHZtLXByb2plY3QgZDFlNjg1ZGY0NWRjNTk0NGI0M2QyNTQ3ZDAxMzhjZDRhM2VlNGVmZSkALA90YXJnZXRfZmVhdHVyZXMCKw9tdXRhYmxlLWdsb2JhbHMrCHNpZ24tZXh0" }), x = new Uint8Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("").map((r11) => r11.charCodeAt(0))), L2 = new Uint32Array(1024);
    L2.fill(4278190080);
    for (let r11 = 0; r11 < x.length; ++r11) L2[x[r11]] = r11 << 2;
    for (let r11 = 0; r11 < x.length; ++r11) L2[256 + x[r11]] = r11 >> 4 | (r11 << 4 & 255) << 8;
    for (let r11 = 0; r11 < x.length; ++r11) L2[512 + x[r11]] = r11 >> 2 << 8 | (r11 << 6 & 255) << 16;
    for (let r11 = 0; r11 < x.length; ++r11) L2[768 + x[r11]] = r11 << 16;
    var xt5 = new Uint8Array(0), me4 = class {
      constructor(e) {
        this.keepSize = e;
      }
      get data8() {
        return this._inst ? this._d.subarray(0, this._m32[1282]) : xt5;
      }
      release() {
        this._inst && (this._mem.buffer.byteLength > this.keepSize ? this._inst = this._m32 = this._d = this._mem = null : (this._m32[1280] = 0, this._m32[1281] = 0, this._m32[1282] = 0));
      }
      init(e) {
        let t = this._m32, i8 = (Math.ceil(e / 3) + 1288) * 4;
        this._inst ? this._mem.buffer.byteLength < i8 && (this._mem.grow(Math.ceil((i8 - this._mem.buffer.byteLength) / 65536)), t = new Uint32Array(this._mem.buffer, 0), this._d = new Uint8Array(this._mem.buffer, 1288 * 4)) : (this._mem = new WebAssembly.Memory({ initial: Math.ceil(i8 / 65536) }), this._inst = wt3({ env: { memory: this._mem } }), t = new Uint32Array(this._mem.buffer, 0), t.set(L2, 256), this._d = new Uint8Array(this._mem.buffer, 1288 * 4)), t[1284] = e, t[1283] = Math.ceil(e / 3) * 4, t[1280] = 0, t[1281] = 0, t[1282] = 0, this._m32 = t;
      }
      put(e, t, i8) {
        if (!this._inst) return 1;
        let s = this._m32;
        return i8 - t + s[1280] > s[1283] ? 1 : (this._d.set(e.subarray(t, i8), s[1280]), s[1280] += i8 - t, s[1280] - s[1281] >= 131072 ? this._inst.exports.dec() : 0);
      }
      end() {
        return this._inst ? this._inst.exports.end() : 1;
      }
    };
    Ce3.default = me4;
  });
  var je3 = N3((oe) => {
    "use strict";
    Object.defineProperty(oe, "__esModule", { value: true });
    oe.LIMITS = void 0;
    oe.LIMITS = { CHUNK_SIZE: 16384, PALETTE_SIZE: 4096, MAX_WIDTH: 16384, BYTES: "AGFzbQEAAAABJAdgAAF/YAJ/fwBgA39/fwF/YAF/AX9gAABgBH9/f38AYAF/AAIlAgNlbnYLaGFuZGxlX2JhbmQAAwNlbnYLbW9kZV9wYXJzZWQAAwMTEgQAAAAAAQQBAQUBAAACAgAGAwQFAXABBwcFBAEBBwcGCAF/AUGAihoLB9wBDgZtZW1vcnkCABFnZXRfc3RhdGVfYWRkcmVzcwADEWdldF9jaHVua19hZGRyZXNzAAQOZ2V0X3AwX2FkZHJlc3MABRNnZXRfcGFsZXR0ZV9hZGRyZXNzAAYEaW5pdAALBmRlY29kZQAMDWN1cnJlbnRfd2lkdGgADQ5jdXJyZW50X2hlaWdodAAOGV9faW5kaXJlY3RfZnVuY3Rpb25fdGFibGUBAAtfaW5pdGlhbGl6ZQACCXN0YWNrU2F2ZQARDHN0YWNrUmVzdG9yZQASCnN0YWNrQWxsb2MAEwkMAQBBAQsGCgcJDxACDAEBCq5UEgMAAQsFAEGgCAsGAEGQiQELBgBBsIkCCwUAQZAJC+okAQh/QeQIKAIAIQVB4AgoAgAhA0HoCCgCACEIIAFBkIkBaiIJQf8BOgAAIAAgAUgEQCAAQZCJAWohBgNAIAMhBCAGQQFqIQECQCAGLQAAQf8AcSIDQTBrQQlLBEAgASEGDAELQewIKAIAQQJ0QewIaiICKAIAIQADQCACIAMgAEEKbGpBMGsiADYCACABLQAAIQMgAUEBaiIGIQEgA0H/AHEiA0Ewa0EKSQ0ACwsCQAJAAkACQAJAAkACQAJ/AkACQCADQT9rIgBBP00EQCAERQ0BIARBIUYEQAJAQfAIKAIAIgFBASABGyIHIAhqIgFB1AgoAgAiA0gNACADQf//AEoNAANAIANBAnQiAkGgiQJqIgRBoAgpAwA3AwAgAkGoiQJqQaAIKQMANwMAIAJBsIkCakGgCCkDADcDACACQbiJAmpBoAgpAwA3AwAgAkHAiQJqQaAIKQMANwMAIAJByIkCakGgCCkDADcDACACQdCJAmpBoAgpAwA3AwAgAkHYiQJqQaAIKQMANwMAIAJB4IkCakGgCCkDADcDACACQeiJAmpBoAgpAwA3AwAgAkHwiQJqQaAIKQMANwMAIAJB+IkCakGgCCkDADcDACACQYCKAmpBoAgpAwA3AwAgAkGIigJqQaAIKQMANwMAIAJBkIoCakGgCCkDADcDACACQZiKAmpBoAgpAwA3AwAgAkGgigJqQaAIKQMANwMAIAJBqIoCakGgCCkDADcDACACQbCKAmpBoAgpAwA3AwAgAkG4igJqQaAIKQMANwMAIAJBwIoCakGgCCkDADcDACACQciKAmpBoAgpAwA3AwAgAkHQigJqQaAIKQMANwMAIAJB2IoCakGgCCkDADcDACACQeCKAmpBoAgpAwA3AwAgAkHoigJqQaAIKQMANwMAIAJB8IoCakGgCCkDADcDACACQfiKAmpBoAgpAwA3AwAgAkGAiwJqQaAIKQMANwMAIAJBiIsCakGgCCkDADcDACACQZCLAmpBoAgpAwA3AwAgAkGYiwJqQaAIKQMANwMAIAJBoIsCakGgCCkDADcDACACQaiLAmpBoAgpAwA3AwAgAkGwiwJqQaAIKQMANwMAIAJBuIsCakGgCCkDADcDACACQcCLAmpBoAgpAwA3AwAgAkHIiwJqQaAIKQMANwMAIAJB0IsCakGgCCkDADcDACACQdiLAmpBoAgpAwA3AwAgAkHgiwJqQaAIKQMANwMAIAJB6IsCakGgCCkDADcDACACQfCLAmpBoAgpAwA3AwAgAkH4iwJqQaAIKQMANwMAIAJBgIwCakGgCCkDADcDACACQYiMAmpBoAgpAwA3AwAgAkGQjAJqQaAIKQMANwMAIAJBmIwCakGgCCkDADcDACACQaCMAmpBoAgpAwA3AwAgAkGojAJqQaAIKQMANwMAIAJBsIwCakGgCCkDADcDACACQbiMAmpBoAgpAwA3AwAgAkHAjAJqQaAIKQMANwMAIAJByIwCakGgCCkDADcDACACQdCMAmpBoAgpAwA3AwAgAkHYjAJqQaAIKQMANwMAIAJB4IwCakGgCCkDADcDACACQeiMAmpBoAgpAwA3AwAgAkHwjAJqQaAIKQMANwMAIAJB+IwCakGgCCkDADcDACACQYCNAmpBoAgpAwA3AwAgAkGIjQJqQaAIKQMANwMAIAJBkI0CakGgCCkDADcDACACQZiNAmpBoAgpAwA3AwAgAkGwiQZqIARBgAT8CgAAQdQIKAIAQQJ0QcCJCmogBEGABPwKAABB1AgoAgBBAnRB0IkOaiAEQYAE/AoAAEHUCCgCAEECdEHgiRJqIARBgAT8CgAAQdQIKAIAQQJ0QfCJFmogBEGABPwKAABB1AhB1AgoAgAiAkGAAWoiAzYCACABIANIDQEgAkGA/wBIDQALCwJAIABFDQAgCEH//wBLDQBBgIABIAhrIAcgAUH//wBLGyECAkAgAEEBcUUNACACRQ0AIAhBAnRBoIkCaiEDIAIhBCACQQdxIgcEQANAIAMgBTYCACADQQRqIQMgBEEBayEEIAdBAWsiBw0ACwsgAkEBa0EHSQ0AA0AgAyAFNgIcIAMgBTYCGCADIAU2AhQgAyAFNgIQIAMgBTYCDCADIAU2AgggAyAFNgIEIAMgBTYCACADQSBqIQMgBEEIayIEDQALCwJAIABBAnFFDQAgAkUNACAIQQJ0QbCJBmohAyACIQQgAkEHcSIHBEADQCADIAU2AgAgA0EEaiEDIARBAWshBCAHQQFrIgcNAAsLIAJBAWtBB0kNAANAIAMgBTYCHCADIAU2AhggAyAFNgIUIAMgBTYCECADIAU2AgwgAyAFNgIIIAMgBTYCBCADIAU2AgAgA0EgaiEDIARBCGsiBA0ACwsCQCAAQQRxRQ0AIAJFDQAgCEECdEHAiQpqIQMgAiEEIAJBB3EiBwRAA0AgAyAFNgIAIANBBGohAyAEQQFrIQQgB0EBayIHDQALCyACQQFrQQdJDQADQCADIAU2AhwgAyAFNgIYIAMgBTYCFCADIAU2AhAgAyAFNgIMIAMgBTYCCCADIAU2AgQgAyAFNgIAIANBIGohAyAEQQhrIgQNAAsLAkAgAEEIcUUNACACRQ0AIAhBAnRB0IkOaiEDIAIhBCACQQdxIgcEQANAIAMgBTYCACADQQRqIQMgBEEBayEEIAdBAWsiBw0ACwsgAkEBa0EHSQ0AA0AgAyAFNgIcIAMgBTYCGCADIAU2AhQgAyAFNgIQIAMgBTYCDCADIAU2AgggAyAFNgIEIAMgBTYCACADQSBqIQMgBEEIayIEDQALCwJAIABBEHFFDQAgAkUNACAIQQJ0QeCJEmohAyACIQQgAkEHcSIHBEADQCADIAU2AgAgA0EEaiEDIARBAWshBCAHQQFrIgcNAAsLIAJBAWtBB0kNAANAIAMgBTYCHCADIAU2AhggAyAFNgIUIAMgBTYCECADIAU2AgwgAyAFNgIIIAMgBTYCBCADIAU2AgAgA0EgaiEDIARBCGsiBA0ACwsgAEEgcUUNACACRQ0AIAJBAWshByAIQQJ0QfCJFmohAyACQQdxIgQEQANAIAMgBTYCACADQQRqIQMgAkEBayECIARBAWsiBA0ACwsgB0EHSQ0AA0AgAyAFNgIcIAMgBTYCGCADIAU2AhQgAyAFNgIQIAMgBTYCDCADIAU2AgggAyAFNgIEIAMgBTYCACADQSBqIQMgAkEIayICDQALC0HcCEHcCCgCACAAcjYCACAGQQFqIgIgBi0AAEH/AHEiA0E/ayIAQT9LDQQaDAMLAkBB7AgoAgAiBEEBRgRAQfAIKAIAIgNBzAgoAgAiAUkNASADIAFwIQMMAQtB+AgoAgAhAkH0CCgCACEBAkACQCAEQQVHDQAgAUEBRw0AIAJB6QJODQQMAQsgAkHkAEoNA0H8CCgCAEHkAEoNA0GACSgCAEHkAEoNAwsCQCABRQ0AIAFBAkoNACACQfwIKAIAQYAJKAIAIAFBAnRBiAhqKAIAEQIAIQFB8AgoAgAiA0HMCCgCACICTwR/IAMgAnAFIAMLQQJ0QZAJaiABNgIAC0HwCCgCACIDQcwIKAIAIgFJDQAgAyABcCEDCyADQQJ0QZAJaigCACEFDAELIANB/QBxQSFHBEAgCCEBIAYhAgwECyAEQSNHDQQCQEHsCCgCACICQQFGBEBB8AgoAgAiAUHMCCgCACIASQ0BIAEgAHAhAQwBC0H4CCgCACEBQfQIKAIAIQACQAJAIAJBBUcNACAAQQFHDQAgAUHpAkgNAQwHCyABQeQASg0GQfwIKAIAQeQASg0GQYAJKAIAQeQASg0GCwJAIABFDQAgAEECSg0AIAFB/AgoAgBBgAkoAgAgAEECdEGICGooAgARAgAhAEHwCCgCACIBQcwIKAIAIgJPBH8gASACcAUgAQtBAnRBkAlqIAA2AgALQfAIKAIAIgFBzAgoAgAiAEkNACABIABwIQELIAFBAnRBkAlqKAIAIQUMBAsgCCEBIAYhAgtB1AgoAgAhBgNAAkAgASAGSA0AIAZB//8ASg0AIAZBAnQiBEGgiQJqIgZBoAgpAwA3AwAgBEGoiQJqQaAIKQMANwMAIARBsIkCakGgCCkDADcDACAEQbiJAmpBoAgpAwA3AwAgBEHAiQJqQaAIKQMANwMAIARByIkCakGgCCkDADcDACAEQdCJAmpBoAgpAwA3AwAgBEHYiQJqQaAIKQMANwMAIARB4IkCakGgCCkDADcDACAEQeiJAmpBoAgpAwA3AwAgBEHwiQJqQaAIKQMANwMAIARB+IkCakGgCCkDADcDACAEQYCKAmpBoAgpAwA3AwAgBEGIigJqQaAIKQMANwMAIARBkIoCakGgCCkDADcDACAEQZiKAmpBoAgpAwA3AwAgBEGgigJqQaAIKQMANwMAIARBqIoCakGgCCkDADcDACAEQbCKAmpBoAgpAwA3AwAgBEG4igJqQaAIKQMANwMAIARBwIoCakGgCCkDADcDACAEQciKAmpBoAgpAwA3AwAgBEHQigJqQaAIKQMANwMAIARB2IoCakGgCCkDADcDACAEQeCKAmpBoAgpAwA3AwAgBEHoigJqQaAIKQMANwMAIARB8IoCakGgCCkDADcDACAEQfiKAmpBoAgpAwA3AwAgBEGAiwJqQaAIKQMANwMAIARBiIsCakGgCCkDADcDACAEQZCLAmpBoAgpAwA3AwAgBEGYiwJqQaAIKQMANwMAIARBoIsCakGgCCkDADcDACAEQaiLAmpBoAgpAwA3AwAgBEGwiwJqQaAIKQMANwMAIARBuIsCakGgCCkDADcDACAEQcCLAmpBoAgpAwA3AwAgBEHIiwJqQaAIKQMANwMAIARB0IsCakGgCCkDADcDACAEQdiLAmpBoAgpAwA3AwAgBEHgiwJqQaAIKQMANwMAIARB6IsCakGgCCkDADcDACAEQfCLAmpBoAgpAwA3AwAgBEH4iwJqQaAIKQMANwMAIARBgIwCakGgCCkDADcDACAEQYiMAmpBoAgpAwA3AwAgBEGQjAJqQaAIKQMANwMAIARBmIwCakGgCCkDADcDACAEQaCMAmpBoAgpAwA3AwAgBEGojAJqQaAIKQMANwMAIARBsIwCakGgCCkDADcDACAEQbiMAmpBoAgpAwA3AwAgBEHAjAJqQaAIKQMANwMAIARByIwCakGgCCkDADcDACAEQdCMAmpBoAgpAwA3AwAgBEHYjAJqQaAIKQMANwMAIARB4IwCakGgCCkDADcDACAEQeiMAmpBoAgpAwA3AwAgBEHwjAJqQaAIKQMANwMAIARB+IwCakGgCCkDADcDACAEQYCNAmpBoAgpAwA3AwAgBEGIjQJqQaAIKQMANwMAIARBkI0CakGgCCkDADcDACAEQZiNAmpBoAgpAwA3AwAgBEGwiQZqIAZBgAT8CgAAQdQIKAIAQQJ0QcCJCmogBkGABPwKAABB1AgoAgBBAnRB0IkOaiAGQYAE/AoAAEHUCCgCAEECdEHgiRJqIAZBgAT8CgAAQdQIKAIAQQJ0QfCJFmogBkGABPwKAABB1AhB1AgoAgBBgAFqIgY2AgALIAFB//8ATQRAIABBAXEgAWxBAnRBoIkCaiAFNgIAIABBAXZBAXEgAWxBAnRBsIkGaiAFNgIAIABBAnZBAXEgAWxBAnRBwIkKaiAFNgIAIABBA3ZBAXEgAWxBAnRB0IkOaiAFNgIAIABBBHZBAXEgAWxBAnRB4IkSaiAFNgIAIABBBXYgAWxBAnRB8IkWaiAFNgIAQdQIKAIAIQYLIAFBAWohAUHcCEHcCCgCACAAcjYCACACLQAAIQAgAkEBaiIEIQIgAEH/AHEiA0E/ayIAQcAASQ0ACyAECyECQQAhBCACIQYgASEIIANB/QBxQSFGDQELIANBJGsOCgEDAwMDAwMDAwIDC0HsCEIBNwIADAQLQdgIIAFB2AgoAgAiACAAIAFIGyIAQYCAASAAQYCAAUgbNgIADAILQegIIAFB2AgoAgAiACAAIAFIGyIAQYCAASAAQYCAAUgbIgA2AgBB2AggADYCACAAQQRrEAAEQEHoCEEENgIAQdgIQQQ2AgBB0AhBATYCAA8LEAgMAQsCQCADQTtHDQBB7AgoAgAiAEEHSg0AQewIIABBAWo2AgAgAEECdEHwCGpBADYCAAsgAiEGIAQhAyABIQgMAQtBBCEIIAIhBiAEIQMLIAYgCUkNAAsLQeQIIAU2AgBB4AggAzYCAEHoCCAINgIAC9ELAgF+CH9B2AhCBDcDAEGojQJBoAgpAwAiADcDAEGgjQIgADcDAEGYjQIgADcDAEGQjQIgADcDAEGIjQIgADcDAEGAjQIgADcDAEH4jAIgADcDAEHwjAIgADcDAEHojAIgADcDAEHgjAIgADcDAEHYjAIgADcDAEHQjAIgADcDAEHIjAIgADcDAEHAjAIgADcDAEG4jAIgADcDAEGwjAIgADcDAEGojAIgADcDAEGgjAIgADcDAEGYjAIgADcDAEGQjAIgADcDAEGIjAIgADcDAEGAjAIgADcDAEH4iwIgADcDAEHwiwIgADcDAEHoiwIgADcDAEHgiwIgADcDAEHYiwIgADcDAEHQiwIgADcDAEHIiwIgADcDAEHAiwIgADcDAEG4iwIgADcDAEGwiwIgADcDAEGoiwIgADcDAEGgiwIgADcDAEGYiwIgADcDAEGQiwIgADcDAEGIiwIgADcDAEGAiwIgADcDAEH4igIgADcDAEHwigIgADcDAEHoigIgADcDAEHgigIgADcDAEHYigIgADcDAEHQigIgADcDAEHIigIgADcDAEHAigIgADcDAEG4igIgADcDAEGwigIgADcDAEGoigIgADcDAEGgigIgADcDAEGYigIgADcDAEGQigIgADcDAEGIigIgADcDAEGAigIgADcDAEH4iQIgADcDAEHwiQIgADcDAEHoiQIgADcDAEHgiQIgADcDAEHYiQIgADcDAEHQiQIgADcDAEHIiQIgADcDAEHAiQIgADcDAEG4iQIgADcDAEGwiQIgADcDAEGoCCgCACIEQf8AakGAAW0hCAJAIARBgQFIDQBBASEBIAhBAiAIQQJKG0EBayICQQFxIQMgBEGBAk4EQCACQX5xIQIDQCABQQl0IgdBEHJBoIkCakGwiQJBgAT8CgAAIAdBsI0CakGwiQJBgAT8CgAAIAFBAmohASACQQJrIgINAAsLIANFDQAgAUEJdEEQckGgiQJqQbCJAkGABPwKAAALAkAgBEEBSA0AIAhBASAIQQFKGyIDQQFxIQUCQCADQQFrIgdFBEBBACEBDAELIANB/v///wdxIQJBACEBA0AgAUEJdCIGQRByQbCJBmpBsIkCQYAE/AoAACAGQZAEckGwiQZqQbCJAkGABPwKAAAgAUECaiEBIAJBAmsiAg0ACwsgBQRAIAFBCXRBEHJBsIkGakGwiQJBgAT8CgAACyAEQQFIDQAgA0EBcSEFIAcEfyADQf7///8HcSECQQAhAQNAIAFBCXQiBkEQckHAiQpqQbCJAkGABPwKAAAgBkGQBHJBwIkKakGwiQJBgAT8CgAAIAFBAmohASACQQJrIgINAAsgAUEHdEEEcgVBBAshASAFBEAgAUECdEHAiQpqQbCJAkGABPwKAAALIARBAUgNACADQQFxIQUgBwR/IANB/v///wdxIQJBACEBA0AgAUEJdCIGQRByQdCJDmpBsIkCQYAE/AoAACAGQZAEckHQiQ5qQbCJAkGABPwKAAAgAUECaiEBIAJBAmsiAg0ACyABQQd0QQRyBUEECyEBIAUEQCABQQJ0QdCJDmpBsIkCQYAE/AoAAAsgBEEBSA0AIANBAXEhBSAHBH8gA0H+////B3EhAkEAIQEDQCABQQl0IgZBEHJB4IkSakGwiQJBgAT8CgAAIAZBkARyQeCJEmpBsIkCQYAE/AoAACABQQJqIQEgAkECayICDQALIAFBB3RBBHIFQQQLIQEgBQRAIAFBAnRB4IkSakGwiQJBgAT8CgAACyAEQQFIDQAgA0EBcSEEIAcEfyADQf7///8HcSECQQAhAQNAIAFBCXQiA0EQckHwiRZqQbCJAkGABPwKAAAgA0GQBHJB8IkWakGwiQJBgAT8CgAAIAFBAmohASACQQJrIgINAAsgAUEHdEEEcgVBBAshASAERQ0AIAFBAnRB8IkWakGwiQJBgAT8CgAAC0HUCCAIQQd0QQRyNgIAC58TAgh/AX5B5AgoAgAhA0HgCCgCACECQegIKAIAIQcgAUGQiQFqIglB/wE6AAAgACABSARAIABBkIkBaiEIA0AgAiEEIAhBAWohAQJAIAgtAABB/wBxIgJBMGtBCUsEQCABIQgMAQtB7AgoAgBBAnRB7AhqIgUoAgAhAANAIAUgAiAAQQpsakEwayIANgIAIAEtAAAhAiABQQFqIgghASACQf8AcSICQTBrQQpJDQALCwJAAkACQAJAAkACQAJ/AkAgAkE/ayIAQT9NBEAgBEUNASAEQSFGBEBB8AgoAgAiAUEBIAEbIgQgB2ohAQJAIABFDQAgB0H//wBLDQBBgIABIAdrIAQgAUH//wBLGyEFAkAgAEEBcUUNACAHQQJ0QaCJAmohAiAFIgRBB3EiBgRAA0AgAiADNgIAIAJBBGohAiAEQQFrIQQgBkEBayIGDQALCyAFQQFrQQdJDQADQCACIAM2AhwgAiADNgIYIAIgAzYCFCACIAM2AhAgAiADNgIMIAIgAzYCCCACIAM2AgQgAiADNgIAIAJBIGohAiAEQQhrIgQNAAsLAkAgAEECcUUNACAHQQJ0QbCJBmohAiAFIgRBB3EiBgRAA0AgAiADNgIAIAJBBGohAiAEQQFrIQQgBkEBayIGDQALCyAFQQFrQQdJDQADQCACIAM2AhwgAiADNgIYIAIgAzYCFCACIAM2AhAgAiADNgIMIAIgAzYCCCACIAM2AgQgAiADNgIAIAJBIGohAiAEQQhrIgQNAAsLAkAgAEEEcUUNACAHQQJ0QcCJCmohAiAFIgRBB3EiBgRAA0AgAiADNgIAIAJBBGohAiAEQQFrIQQgBkEBayIGDQALCyAFQQFrQQdJDQADQCACIAM2AhwgAiADNgIYIAIgAzYCFCACIAM2AhAgAiADNgIMIAIgAzYCCCACIAM2AgQgAiADNgIAIAJBIGohAiAEQQhrIgQNAAsLAkAgAEEIcUUNACAHQQJ0QdCJDmohAiAFIgRBB3EiBgRAA0AgAiADNgIAIAJBBGohAiAEQQFrIQQgBkEBayIGDQALCyAFQQFrQQdJDQADQCACIAM2AhwgAiADNgIYIAIgAzYCFCACIAM2AhAgAiADNgIMIAIgAzYCCCACIAM2AgQgAiADNgIAIAJBIGohAiAEQQhrIgQNAAsLAkAgAEEQcUUNACAHQQJ0QeCJEmohAiAFIgRBB3EiBgRAA0AgAiADNgIAIAJBBGohAiAEQQFrIQQgBkEBayIGDQALCyAFQQFrQQdJDQADQCACIAM2AhwgAiADNgIYIAIgAzYCFCACIAM2AhAgAiADNgIMIAIgAzYCCCACIAM2AgQgAiADNgIAIAJBIGohAiAEQQhrIgQNAAsLIABBIHFFDQAgBUEBayEEIAdBAnRB8IkWaiEAIAVBB3EiAgRAA0AgACADNgIAIABBBGohACAFQQFrIQUgAkEBayICDQALCyAEQQdJDQADQCAAIAM2AhwgACADNgIYIAAgAzYCFCAAIAM2AhAgACADNgIMIAAgAzYCCCAAIAM2AgQgACADNgIAIABBIGohACAFQQhrIgUNAAsLIAhBAWoiBSAILQAAQf8AcSICQT9rIgBBP00NAxoMBAsCQEHsCCgCACIFQQFGBEBB8AgoAgAiAUHMCCgCACIESQ0BIAEgBHAhAQwBC0H4CCgCACEEQfQIKAIAIQECQAJAIAVBBUcNACABQQFHDQAgBEHpAk4NBAwBCyAEQeQASg0DQfwIKAIAQeQASg0DQYAJKAIAQeQASg0DCwJAIAFFDQAgAUECSg0AIARB/AgoAgBBgAkoAgAgAUECdEGICGooAgARAgAhBEHwCCgCACIBQcwIKAIAIgVPBH8gASAFcAUgAQtBAnRBkAlqIAQ2AgALQfAIKAIAIgFBzAgoAgAiBEkNACABIARwIQELIAFBAnRBkAlqKAIAIQMMAQsgAkH9AHFBIUcEQCAHIQEgAiEADAQLIARBI0cNBAJAQewIKAIAIgRBAUYEQEHwCCgCACIBQcwIKAIAIgBJDQEgASAAcCEBDAELQfgIKAIAIQFB9AgoAgAhAAJAAkAgBEEFRw0AIABBAUcNACABQekCSA0BDAcLIAFB5ABKDQZB/AgoAgBB5ABKDQZBgAkoAgBB5ABKDQYLAkAgAEUNACAAQQJKDQAgAUH8CCgCAEGACSgCACAAQQJ0QYgIaigCABECACEAQfAIKAIAIgFBzAgoAgAiBE8EfyABIARwBSABC0ECdEGQCWogADYCAAtB8AgoAgAiAUHMCCgCACIASQ0AIAEgAHAhAQsgAUECdEGQCWooAgAhAwwECyAHIQEgCAshBQNAIAFB//8ATQRAIABBAXEgAWxBAnRBoIkCaiADNgIAIABBAXZBAXEgAWxBAnRBsIkGaiADNgIAIABBAnZBAXEgAWxBAnRBwIkKaiADNgIAIABBA3ZBAXEgAWxBAnRB0IkOaiADNgIAIABBBHZBAXEgAWxBAnRB4IkSaiADNgIAIABBBXYgAWxBAnRB8IkWaiADNgIACyABQQFqIQEgBS0AACEAIAVBAWoiBCEFIABB/wBxIgJBP2siAEHAAEkNAAsgBCEFC0EAIQQgBSEIIAEhByACIQAgAkH9AHFBIUYNAQtBBCEHIAQhAiAAQSRrDgoDAgICAgICAgIBAgtB7AhCATcCAAwCC0GoCCgCAEEEaxAABEBB0AhBATYCAA8LAkBBqAgoAgAiBkEFSA0AQaAIKQMAIQogBkEDa0EBdiIBQQdxIQJBACEAIAFBAWtBB08EQCABQfj///8HcSEFA0AgAEEDdCIBQbCJAmogCjcDACABQQhyQbCJAmogCjcDACABQRByQbCJAmogCjcDACABQRhyQbCJAmogCjcDACABQSByQbCJAmogCjcDACABQShyQbCJAmogCjcDACABQTByQbCJAmogCjcDACABQThyQbCJAmogCjcDACAAQQhqIQAgBUEIayIFDQALCyACRQ0AA0AgAEEDdEGwiQJqIAo3AwAgAEEBaiEAIAJBAWsiAg0ACwtBwIkGQbCJAiAGQQJ0IgD8CgAAQdCJCkGwiQIgAPwKAABB4IkOQbCJAiAA/AoAAEHwiRJBsIkCIAD8CgAAQYCKFkGwiQIgAPwKAAAgBCECDAELAkAgAEE7Rw0AQewIKAIAIgBBB0oNAEHsCCAAQQFqNgIAIABBAnRB8AhqQQA2AgALIAEhBwsgCCAJSQ0ACwtB5AggAzYCAEHgCCACNgIAQegIIAc2AgAL4gcCBX8BfgJAQdAIAn8CQAJAIAAgAU4NACABQZCJAWohBiAAQZCJAWohBQNAIAUtAAAiA0H/AHEhAgJAAkACQAJAAkACQAJAQeAIKAIAIgRBIkcEQCAEDQcgAkEiRgRAQewIQgE3AgBB4AhBIjYCAAwICyACQT9rQcAASQ0GIANBIWsiAkEMTQ0BDAULAkAgAkEwayIEQQlNBEBB7AgoAgBBAnRB7AhqIgIgBCACKAIAQQpsajYCAAwBC0HsCCgCACEEIAJBO0YEQCAEQQdKDQFB7AggBEEBajYCACAEQQJ0QfAIakEANgIADAELIARBBEYEQEHECEECNgIAQbAIQfAIKQMANwMAQbgIQfgIKAIAIgI2AgBBvAhB/AgoAgAiBDYCAEHICEECQQFBwAgoAgAiAxs2AgBBrAggBEEAIAMbNgIAQagIIAJBgIABIAJBgIABSBtBBGpBACADGzYCAEHgCEEANgIADAoLIAJBP2tBwABJDQQLIANBIWsiAkEMTQ0BDAILQQEgAnRBjSBxRQ0DDAQLQQEgAnRBjSBxDQELIANBoQFrIgJBDEsNA0EBIAJ0QY0gcUUNAwtBxAhCgYCAgBA3AgBBsAhB8AgoAgBBAEHsCCgCACICQQBKGzYCAEG0CEH0CCgCAEEAIAJBAUobNgIAQbgIQfgIKAIAQQAgAkECShs2AgBB4AhBADYCAEG8CEEANgIADAQLIANBoQFrIgJBDEsNAUEBIAJ0QY0gcUUNAQtBxAhCgYCAgBA3AgBBsAhCADcDAEG4CEIANwMADAMLIAVBAWoiBSAGSQ0ACwsCQEHICCgCAA4DAwEAAQsCQEGoCCgCACIFQQVIDQBBoAgpAwAhByAFQQNrQQF2IgNBB3EhBEEAIQIgA0EBa0EHTwRAIANB+P///wdxIQYDQCACQQN0IgNBsIkCaiAHNwMAIANBCHJBsIkCaiAHNwMAIANBEHJBsIkCaiAHNwMAIANBGHJBsIkCaiAHNwMAIANBIHJBsIkCaiAHNwMAIANBKHJBsIkCaiAHNwMAIANBMHJBsIkCaiAHNwMAIANBOHJBsIkCaiAHNwMAIAJBCGohAiAGQQhrIgYNAAsLIARFDQADQCACQQN0QbCJAmogBzcDACACQQFqIQIgBEEBayIEDQALC0HAiQZBsIkCIAVBAnQiA/wKAABB0IkKQbCJAiAD/AoAAEHgiQ5BsIkCIAP8CgAAQfCJEkGwiQIgA/wKAABBgIoWQbCJAiAD/AoAAEECDAELEAhByAgoAgALEAEiAjYCACACDQAgACABQcgIKAIAQQJ0QYAIaigCABEBAAsLdABB6AhBBDYCAEHkCCAANgIAQewIQgE3AgBBxAhCADcCAEHACCADNgIAQdwIQgA3AgBBqAhCADcDAEGwCEIANwMAQbgIQgA3AwBBzAggAkGAICACQYAgSRs2AgBBoAggAa1CgYCAgBB+NwMAQdAIQQA2AgALIwBB0AgoAgBFBEAgACABQcgIKAIAQQJ0QYAIaigCABEBAAsLWgECfwJAAkACQEHICCgCAEEBaw4CAAECC0HYCEHoCCgCACIAQdgIKAIAIgEgACABShsiAEGAgAEgAEGAgAFIGyIANgIAIABBBGsPC0GoCCgCAEEEayEACyAAC0IBAX8Cf0EGQdwIKAIAIgBBIHENABpBBSAAQRBxDQAaQQQgAEEIcQ0AGkEDIABBBHENABpBAiAAQQFxIABBAnEbCwu9BQEFfQJ/IAJFBEAgAUH/AWxBMmpB5ABtIgBBCHQgAHIgAEEQdHIMAQsgArJDAADIQpUhBiAAQfABarJDAAC0Q5UhBQJ9IAGyQwAAyEKVIgNDAAAAP10EQCADIAZDAACAP5KUDAELIAYgA0MAAIA/IAaTlJILIQcgAyADkiEGAkAgBUOrqqo+kiIEQwAAAABdBEAgBEMAAIA/kiEEDAELIARDAACAP15FDQAgBEMAAIC/kiEECyAGIAeTIQMgBUMAAAAAXSEAAn8CfSADIAcgA5NDAADAQJQgBJSSIARDq6oqPl0NABogByAEQwAAAD9dDQAaIAMgBEOrqio/XUUNABogAyAHIAOTIARDAADAwJRDAACAQJKUkgtDAAB/Q5RDAAAAP5IiBkMAAIBPXSAGQwAAAABgcQRAIAapDAELQQALIQECQCAABEAgBUMAAIA/kiEEDAELIAUiBEMAAIA/XkUNACAFQwAAgL+SIQQLIAVDq6qqvpIiBUMAAAAAXSECAn8CfSADIAcgA5NDAADAQJQgBJSSIARDq6oqPl0NABogByAEQwAAAD9dDQAaIAMgBEOrqio/XUUNABogAyAHIAOTIARDAADAwJRDAACAQJKUkgtDAAB/Q5RDAAAAP5IiBkMAAIBPXSAGQwAAAABgcQRAIAapDAELQQALIQACQCACBEAgBUMAAIA/kiEFDAELIAVDAACAP15FDQAgBUMAAIC/kiEFCwJAIAVDq6oqPl0EQCADIAcgA5NDAADAQJQgBZSSIQcMAQsgBUMAAAA/XQ0AIAVDq6oqP11FBEAgAyEHDAELIAMgByADkyAFQwAAwMCUQwAAgECSlJIhBwsgAEEIdAJ/IAdDAAB/Q5RDAAAAP5IiBkMAAIBPXSAGQwAAAABgcQRAIAapDAELQQALQRB0ciABcgtBgICAeHILNwAgAEH/AWxBMmpB5ABtIAFB/wFsQTJqQeQAbUEIdHIgAkH/AWxBMmpB5ABtQRB0ckGAgIB4cgsEACMACwYAIAAkAAsQACMAIABrQXBxIgAkACAACwsYAQBBgAgLEQEAAAACAAAAAwAAAAQAAAAF" };
  });
  var Xe3 = N3((b) => {
    "use strict";
    Object.defineProperty(b, "__esModule", { value: true });
    b.decodeAsync = b.decode = b.Decoder = b.DecoderAsync = void 0;
    var U3 = W2(), Q4 = je3();
    function kt3(r11) {
      if (typeof Buffer < "u") return Buffer.from(r11, "base64");
      let e = atob(r11), t = new Uint8Array(e.length);
      for (let i8 = 0; i8 < t.length; ++i8) t[i8] = e.charCodeAt(i8);
      return t;
    }
    var Ve3 = kt3(Q4.LIMITS.BYTES), K4, ae3 = new Uint32Array(), _e3 = class {
      constructor() {
        this.bandHandler = (e) => 1, this.modeHandler = (e) => 1;
      }
      handle_band(e) {
        return this.bandHandler(e);
      }
      mode_parsed(e) {
        return this.modeHandler(e);
      }
    }, Mt3 = { memoryLimit: 2048 * 65536, sixelColor: U3.DEFAULT_FOREGROUND, fillColor: U3.DEFAULT_BACKGROUND, palette: U3.PALETTE_VT340_COLOR, paletteLimit: Q4.LIMITS.PALETTE_SIZE, truncate: true };
    function Ze3(r11) {
      let e = new _e3(), t = { env: { handle_band: e.handle_band.bind(e), mode_parsed: e.mode_parsed.bind(e) } };
      return WebAssembly.instantiate(K4 || Ve3, t).then((i8) => (K4 = K4 || i8.module, new O4(r11, i8.instance || i8, e)));
    }
    b.DecoderAsync = Ze3;
    var O4 = class {
      constructor(e, t, i8) {
        if (this._PIXEL_OFFSET = Q4.LIMITS.MAX_WIDTH + 4, this._canvas = ae3, this._bandWidths = [], this._maxWidth = 0, this._minWidth = Q4.LIMITS.MAX_WIDTH, this._lastOffset = 0, this._currentHeight = 0, this._opts = Object.assign({}, Mt3, e), this._opts.paletteLimit > Q4.LIMITS.PALETTE_SIZE) throw new Error(`DecoderOptions.paletteLimit must not exceed ${Q4.LIMITS.PALETTE_SIZE}`);
        if (t) i8.bandHandler = this._handle_band.bind(this), i8.modeHandler = this._initCanvas.bind(this);
        else {
          let s = K4 || (K4 = new WebAssembly.Module(Ve3));
          t = new WebAssembly.Instance(s, { env: { handle_band: this._handle_band.bind(this), mode_parsed: this._initCanvas.bind(this) } });
        }
        this._instance = t, this._wasm = this._instance.exports, this._chunk = new Uint8Array(this._wasm.memory.buffer, this._wasm.get_chunk_address(), Q4.LIMITS.CHUNK_SIZE), this._states = new Uint32Array(this._wasm.memory.buffer, this._wasm.get_state_address(), 12), this._palette = new Uint32Array(this._wasm.memory.buffer, this._wasm.get_palette_address(), Q4.LIMITS.PALETTE_SIZE), this._palette.set(this._opts.palette), this._pSrc = new Uint32Array(this._wasm.memory.buffer, this._wasm.get_p0_address()), this._wasm.init(U3.DEFAULT_FOREGROUND, 0, this._opts.paletteLimit, 0);
      }
      get _fillColor() {
        return this._states[0];
      }
      get _truncate() {
        return this._states[8];
      }
      get _rasterWidth() {
        return this._states[6];
      }
      get _rasterHeight() {
        return this._states[7];
      }
      get _width() {
        return this._states[2] ? this._states[2] - 4 : 0;
      }
      get _height() {
        return this._states[3];
      }
      get _level() {
        return this._states[9];
      }
      get _mode() {
        return this._states[10];
      }
      get _paletteLimit() {
        return this._states[11];
      }
      _initCanvas(e) {
        if (e === 2) {
          let t = this.width * this.height;
          if (t > this._canvas.length) {
            if (this._opts.memoryLimit && t * 4 > this._opts.memoryLimit) throw this.release(), new Error("image exceeds memory limit");
            this._canvas = new Uint32Array(t);
          }
          this._maxWidth = this._width;
        } else if (e === 1) if (this._level === 2) {
          let t = Math.min(this._rasterWidth, Q4.LIMITS.MAX_WIDTH) * this._rasterHeight;
          if (t > this._canvas.length) {
            if (this._opts.memoryLimit && t * 4 > this._opts.memoryLimit) throw this.release(), new Error("image exceeds memory limit");
            this._canvas = new Uint32Array(t);
          }
        } else this._canvas.length < 65536 && (this._canvas = new Uint32Array(65536));
        return 0;
      }
      _realloc(e, t) {
        let i8 = e + t;
        if (i8 > this._canvas.length) {
          if (this._opts.memoryLimit && i8 * 4 > this._opts.memoryLimit) throw this.release(), new Error("image exceeds memory limit");
          let s = new Uint32Array(Math.ceil(i8 / 65536) * 65536);
          s.set(this._canvas), this._canvas = s;
        }
      }
      _handle_band(e) {
        let t = this._PIXEL_OFFSET, i8 = this._lastOffset;
        if (this._mode === 2) {
          let s = this.height - this._currentHeight, n = 0;
          for (; n < 6 && s > 0; ) this._canvas.set(this._pSrc.subarray(t * n, t * n + e), i8 + e * n), n++, s--;
          this._lastOffset += e * n, this._currentHeight += n;
        } else if (this._mode === 1) {
          this._realloc(i8, e * 6), this._maxWidth = Math.max(this._maxWidth, e), this._minWidth = Math.min(this._minWidth, e);
          for (let s = 0; s < 6; ++s) this._canvas.set(this._pSrc.subarray(t * s, t * s + e), i8 + e * s);
          this._bandWidths.push(e), this._lastOffset += e * 6, this._currentHeight += 6;
        }
        return 0;
      }
      get width() {
        return this._mode !== 1 ? this._width : Math.max(this._maxWidth, this._wasm.current_width());
      }
      get height() {
        return this._mode !== 1 ? this._height : this._wasm.current_width() ? this._bandWidths.length * 6 + this._wasm.current_height() : this._bandWidths.length * 6;
      }
      get palette() {
        return this._palette.subarray(0, this._paletteLimit);
      }
      get memoryUsage() {
        return this._canvas.byteLength + this._wasm.memory.buffer.byteLength + 8 * this._bandWidths.length;
      }
      get properties() {
        return { width: this.width, height: this.height, mode: this._mode, level: this._level, truncate: !!this._truncate, paletteLimit: this._paletteLimit, fillColor: this._fillColor, memUsage: this.memoryUsage, rasterAttributes: { numerator: this._states[4], denominator: this._states[5], width: this._rasterWidth, height: this._rasterHeight } };
      }
      init(e = this._opts.fillColor, t = this._opts.palette, i8 = this._opts.paletteLimit, s = this._opts.truncate) {
        this._wasm.init(this._opts.sixelColor, e, i8, s ? 1 : 0), t && this._palette.set(t.subarray(0, Q4.LIMITS.PALETTE_SIZE)), this._bandWidths.length = 0, this._maxWidth = 0, this._minWidth = Q4.LIMITS.MAX_WIDTH, this._lastOffset = 0, this._currentHeight = 0;
      }
      decode(e, t = 0, i8 = e.length) {
        let s = t;
        for (; s < i8; ) {
          let n = Math.min(i8 - s, Q4.LIMITS.CHUNK_SIZE);
          this._chunk.set(e.subarray(s, s += n)), this._wasm.decode(0, n);
        }
      }
      decodeString(e, t = 0, i8 = e.length) {
        let s = t;
        for (; s < i8; ) {
          let n = Math.min(i8 - s, Q4.LIMITS.CHUNK_SIZE);
          for (let A3 = 0, o2 = s; A3 < n; ++A3, ++o2) this._chunk[A3] = e.charCodeAt(o2);
          s += n, this._wasm.decode(0, n);
        }
      }
      get data32() {
        if (this._mode === 0 || !this.width || !this.height) return ae3;
        let e = this._wasm.current_width();
        if (this._mode === 2) {
          let t = this.height - this._currentHeight;
          if (t > 0) {
            let i8 = this._PIXEL_OFFSET, s = this._lastOffset, n = 0;
            for (; n < 6 && t > 0; ) this._canvas.set(this._pSrc.subarray(i8 * n, i8 * n + e), s + e * n), n++, t--;
            t && this._canvas.fill(this._fillColor, s + e * n);
          }
          return this._canvas.subarray(0, this.width * this.height);
        }
        if (this._mode === 1) {
          if (this._minWidth === this._maxWidth) {
            let n = false;
            if (e) if (e !== this._minWidth) n = true;
            else {
              let A3 = this._PIXEL_OFFSET, o2 = this._lastOffset;
              this._realloc(o2, e * 6);
              for (let a = 0; a < 6; ++a) this._canvas.set(this._pSrc.subarray(A3 * a, A3 * a + e), o2 + e * a);
            }
            if (!n) return this._canvas.subarray(0, this.width * this.height);
          }
          let t = new Uint32Array(this.width * this.height);
          t.fill(this._fillColor);
          let i8 = 0, s = 0;
          for (let n = 0; n < this._bandWidths.length; ++n) {
            let A3 = this._bandWidths[n];
            for (let o2 = 0; o2 < 6; ++o2) t.set(this._canvas.subarray(s, s += A3), i8), i8 += this.width;
          }
          if (e) {
            let n = this._PIXEL_OFFSET, A3 = this._wasm.current_height();
            for (let o2 = 0; o2 < A3; ++o2) t.set(this._pSrc.subarray(n * o2, n * o2 + e), i8 + this.width * o2);
          }
          return t;
        }
        return ae3;
      }
      get data8() {
        return new Uint8ClampedArray(this.data32.buffer, 0, this.width * this.height * 4);
      }
      release() {
        this._canvas = ae3, this._bandWidths.length = 0, this._maxWidth = 0, this._minWidth = Q4.LIMITS.MAX_WIDTH, this._wasm.init(U3.DEFAULT_FOREGROUND, 0, this._opts.paletteLimit, 0);
      }
    };
    b.Decoder = O4;
    function Rt3(r11, e) {
      let t = new O4(e);
      return t.init(), typeof r11 == "string" ? t.decodeString(r11) : t.decode(r11), { width: t.width, height: t.height, data32: t.data32, data8: t.data8 };
    }
    b.decode = Rt3;
    async function Lt3(r11, e) {
      let t = await Ze3(e);
      return t.init(), typeof r11 == "string" ? t.decodeString(r11) : t.decode(r11), { width: t.width, height: t.height, data32: t.data32, data8: t.data8 };
    }
    b.decodeAsync = Lt3;
  });
  var fe3 = Y3(W2());
  var ge3 = class {
    constructor() {
      this.listeners = [], this.unexpectedErrorHandler = function(e) {
        setTimeout(() => {
          throw e.stack ? z.isErrorNoTelemetry(e) ? new z(e.message + `

` + e.stack) : new Error(e.message + `

` + e.stack) : e;
        }, 0);
      };
    }
    addListener(e) {
      return this.listeners.push(e), () => {
        this._removeListener(e);
      };
    }
    emit(e) {
      this.listeners.forEach((t) => {
        t(e);
      });
    }
    _removeListener(e) {
      this.listeners.splice(this.listeners.indexOf(e), 1);
    }
    setUnexpectedErrorHandler(e) {
      this.unexpectedErrorHandler = e;
    }
    getUnexpectedErrorHandler() {
      return this.unexpectedErrorHandler;
    }
    onUnexpectedError(e) {
      this.unexpectedErrorHandler(e), this.emit(e);
    }
    onUnexpectedExternalError(e) {
      this.unexpectedErrorHandler(e);
    }
  };
  var Jt = new ge3();
  var z = class r8 extends Error {
    constructor(e) {
      super(e), this.name = "CodeExpectedError";
    }
    static fromError(e) {
      if (e instanceof r8) return e;
      let t = new r8();
      return t.message = e.message, t.stack = e.stack, t;
    }
    static isErrorNoTelemetry(e) {
      return e.name === "CodeExpectedError";
    }
  };
  function It2(r11, e, t = 0, i8 = r11.length) {
    let s = t, n = i8;
    for (; s < n; ) {
      let A3 = Math.floor((s + n) / 2);
      e(r11[A3]) ? s = A3 + 1 : n = A3;
    }
    return s - 1;
  }
  var q = class q2 {
    constructor(e) {
      this._array = e;
      this._findLastMonotonousLastIdx = 0;
    }
    findLastMonotonous(e) {
      if (q2.assertInvariants) {
        if (this._prevFindLastPredicate) {
          for (let i8 of this._array) if (this._prevFindLastPredicate(i8) && !e(i8)) throw new Error("MonotonousArray: current predicate must be weaker than (or equal to) the previous predicate.");
        }
        this._prevFindLastPredicate = e;
      }
      let t = It2(this._array, e, this._findLastMonotonousLastIdx);
      return this._findLastMonotonousLastIdx = t + 1, t === -1 ? void 0 : this._array[t];
    }
  };
  q.assertInvariants = false;
  var ke3;
  ((o2) => {
    function r11(a) {
      return a < 0;
    }
    o2.isLessThan = r11;
    function e(a) {
      return a <= 0;
    }
    o2.isLessThanOrEqual = e;
    function t(a) {
      return a > 0;
    }
    o2.isGreaterThan = t;
    function i8(a) {
      return a === 0;
    }
    o2.isNeitherLessOrGreaterThan = i8, o2.greaterThan = 1, o2.lessThan = -1, o2.neitherLessOrGreaterThan = 0;
  })(ke3 || (ke3 = {}));
  function Me3(r11, e) {
    return (t, i8) => e(r11(t), r11(i8));
  }
  var Re3 = (r11, e) => r11 - e;
  var M4 = class M5 {
    constructor(e) {
      this.iterate = e;
    }
    forEach(e) {
      this.iterate((t) => (e(t), true));
    }
    toArray() {
      let e = [];
      return this.iterate((t) => (e.push(t), true)), e;
    }
    filter(e) {
      return new M5((t) => this.iterate((i8) => e(i8) ? t(i8) : true));
    }
    map(e) {
      return new M5((t) => this.iterate((i8) => t(e(i8))));
    }
    some(e) {
      let t = false;
      return this.iterate((i8) => (t = e(i8), !t)), t;
    }
    findFirst(e) {
      let t;
      return this.iterate((i8) => e(i8) ? (t = i8, false) : true), t;
    }
    findLast(e) {
      let t;
      return this.iterate((i8) => (e(i8) && (t = i8), true)), t;
    }
    findLastMaxBy(e) {
      let t, i8 = true;
      return this.iterate((s) => ((i8 || ke3.isGreaterThan(e(s, t))) && (i8 = false, t = s), true)), t;
    }
  };
  M4.empty = new M4((e) => {
  });
  function Fe3(r11, e) {
    let t = /* @__PURE__ */ Object.create(null);
    for (let i8 of r11) {
      let s = e(i8), n = t[s];
      n || (n = t[s] = []), n.push(i8);
    }
    return t;
  }
  var Ne2;
  var He2;
  var Le3 = class {
    constructor(e, t) {
      this.toKey = t;
      this._map = /* @__PURE__ */ new Map();
      this[Ne2] = "SetWithKey";
      for (let i8 of e) this.add(i8);
    }
    get size() {
      return this._map.size;
    }
    add(e) {
      let t = this.toKey(e);
      return this._map.set(t, e), this;
    }
    delete(e) {
      return this._map.delete(this.toKey(e));
    }
    has(e) {
      return this._map.has(this.toKey(e));
    }
    *entries() {
      for (let e of this._map.values()) yield [e, e];
    }
    keys() {
      return this.values();
    }
    *values() {
      for (let e of this._map.values()) yield e;
    }
    clear() {
      this._map.clear();
    }
    forEach(e, t) {
      this._map.forEach((i8) => e.call(t, i8, i8, this));
    }
    [(He2 = Symbol.iterator, Ne2 = Symbol.toStringTag, He2)]() {
      return this.values();
    }
  };
  var j2 = class {
    constructor() {
      this.map = /* @__PURE__ */ new Map();
    }
    add(e, t) {
      let i8 = this.map.get(e);
      i8 || (i8 = /* @__PURE__ */ new Set(), this.map.set(e, i8)), i8.add(t);
    }
    delete(e, t) {
      let i8 = this.map.get(e);
      i8 && (i8.delete(t), i8.size === 0 && this.map.delete(e));
    }
    forEach(e, t) {
      let i8 = this.map.get(e);
      i8 && i8.forEach(t);
    }
    get(e) {
      let t = this.map.get(e);
      return t || /* @__PURE__ */ new Set();
    }
  };
  function Ge3(r11, e) {
    let t = this, i8 = false, s;
    return function() {
      if (i8) return s;
      if (i8 = true, e) try {
        s = r11.apply(t, arguments);
      } finally {
        e();
      }
      else s = r11.apply(t, arguments);
      return s;
    };
  }
  var ue4;
  ((rt4) => {
    function r11(d) {
      return d && typeof d == "object" && typeof d[Symbol.iterator] == "function";
    }
    rt4.is = r11;
    let e = Object.freeze([]);
    function t() {
      return e;
    }
    rt4.empty = t;
    function* i8(d) {
      yield d;
    }
    rt4.single = i8;
    function s(d) {
      return r11(d) ? d : i8(d);
    }
    rt4.wrap = s;
    function n(d) {
      return d || e;
    }
    rt4.from = n;
    function* A3(d) {
      for (let p = d.length - 1; p >= 0; p--) yield d[p];
    }
    rt4.reverse = A3;
    function o2(d) {
      return !d || d[Symbol.iterator]().next().done === true;
    }
    rt4.isEmpty = o2;
    function a(d) {
      return d[Symbol.iterator]().next().value;
    }
    rt4.first = a;
    function c(d, p) {
      let f = 0;
      for (let D2 of d) if (p(D2, f++)) return true;
      return false;
    }
    rt4.some = c;
    function h2(d, p) {
      for (let f of d) if (p(f)) return f;
    }
    rt4.find = h2;
    function* l2(d, p) {
      for (let f of d) p(f) && (yield f);
    }
    rt4.filter = l2;
    function* I2(d, p) {
      let f = 0;
      for (let D2 of d) yield p(D2, f++);
    }
    rt4.map = I2;
    function* E(d, p) {
      let f = 0;
      for (let D2 of d) yield* p(D2, f++);
    }
    rt4.flatMap = E;
    function* C4(...d) {
      for (let p of d) yield* p;
    }
    rt4.concat = C4;
    function _4(d, p, f) {
      let D2 = f;
      for (let P5 of d) D2 = p(D2, P5);
      return D2;
    }
    rt4.reduce = _4;
    function* B4(d, p, f = d.length) {
      for (p < 0 && (p += d.length), f < 0 ? f += d.length : f > d.length && (f = d.length); p < f; p++) yield d[p];
    }
    rt4.slice = B4;
    function y(d, p = Number.POSITIVE_INFINITY) {
      let f = [];
      if (p === 0) return [f, d];
      let D2 = d[Symbol.iterator]();
      for (let P5 = 0; P5 < p; P5++) {
        let Te4 = D2.next();
        if (Te4.done) return [f, rt4.empty()];
        f.push(Te4.value);
      }
      return [f, { [Symbol.iterator]() {
        return D2;
      } }];
    }
    rt4.consume = y;
    async function k4(d) {
      let p = [];
      for await (let f of d) p.push(f);
      return Promise.resolve(p);
    }
    rt4.asyncToArray = k4;
  })(ue4 || (ue4 = {}));
  var pt2 = false;
  var $3 = null;
  var Z2 = class Z3 {
    constructor() {
      this.livingDisposables = /* @__PURE__ */ new Map();
    }
    getDisposableData(e) {
      let t = this.livingDisposables.get(e);
      return t || (t = { parent: null, source: null, isSingleton: false, value: e, idx: Z3.idx++ }, this.livingDisposables.set(e, t)), t;
    }
    trackDisposable(e) {
      let t = this.getDisposableData(e);
      t.source || (t.source = new Error().stack);
    }
    setParent(e, t) {
      let i8 = this.getDisposableData(e);
      i8.parent = t;
    }
    markAsDisposed(e) {
      this.livingDisposables.delete(e);
    }
    markAsSingleton(e) {
      this.getDisposableData(e).isSingleton = true;
    }
    getRootParent(e, t) {
      let i8 = t.get(e);
      if (i8) return i8;
      let s = e.parent ? this.getRootParent(this.getDisposableData(e.parent), t) : e;
      return t.set(e, s), s;
    }
    getTrackedDisposables() {
      let e = /* @__PURE__ */ new Map();
      return [...this.livingDisposables.entries()].filter(([, i8]) => i8.source !== null && !this.getRootParent(i8, e).isSingleton).flatMap(([i8]) => i8);
    }
    computeLeakingDisposables(e = 10, t) {
      let i8;
      if (t) i8 = t;
      else {
        let a = /* @__PURE__ */ new Map(), c = [...this.livingDisposables.values()].filter((l2) => l2.source !== null && !this.getRootParent(l2, a).isSingleton);
        if (c.length === 0) return;
        let h2 = new Set(c.map((l2) => l2.value));
        if (i8 = c.filter((l2) => !(l2.parent && h2.has(l2.parent))), i8.length === 0) throw new Error("There are cyclic diposable chains!");
      }
      if (!i8) return;
      function s(a) {
        function c(l2, I2) {
          for (; l2.length > 0 && I2.some((E) => typeof E == "string" ? E === l2[0] : l2[0].match(E)); ) l2.shift();
        }
        let h2 = a.source.split(`
`).map((l2) => l2.trim().replace("at ", "")).filter((l2) => l2 !== "");
        return c(h2, ["Error", /^trackDisposable \(.*\)$/, /^DisposableTracker.trackDisposable \(.*\)$/]), h2.reverse();
      }
      let n = new j2();
      for (let a of i8) {
        let c = s(a);
        for (let h2 = 0; h2 <= c.length; h2++) n.add(c.slice(0, h2).join(`
`), a);
      }
      i8.sort(Me3((a) => a.idx, Re3));
      let A3 = "", o2 = 0;
      for (let a of i8.slice(0, e)) {
        o2++;
        let c = s(a), h2 = [];
        for (let l2 = 0; l2 < c.length; l2++) {
          let I2 = c[l2];
          I2 = `(shared with ${n.get(c.slice(0, l2 + 1).join(`
`)).size}/${i8.length} leaks) at ${I2}`;
          let C4 = n.get(c.slice(0, l2).join(`
`)), _4 = Fe3([...C4].map((B4) => s(B4)[l2]), (B4) => B4);
          delete _4[c[l2]];
          for (let [B4, y] of Object.entries(_4)) h2.unshift(`    - stacktraces of ${y.length} other leaks continue with ${B4}`);
          h2.unshift(I2);
        }
        A3 += `


==================== Leaking disposable ${o2}/${i8.length}: ${a.value.constructor.name} ====================
${h2.join(`
`)}
============================================================

`;
      }
      return i8.length > e && (A3 += `


... and ${i8.length - e} more leaking disposables

`), { leaks: i8, details: A3 };
    }
  };
  Z2.idx = 0;
  function ft2(r11) {
    $3 = r11;
  }
  if (pt2) {
    let r11 = "__is_disposable_tracked__";
    ft2(new class {
      trackDisposable(e) {
        let t = new Error("Potentially leaked disposable").stack;
        setTimeout(() => {
          e[r11] || console.log(t);
        }, 3e3);
      }
      setParent(e, t) {
        if (e && e !== v2.None) try {
          e[r11] = true;
        } catch {
        }
      }
      markAsDisposed(e) {
        if (e && e !== v2.None) try {
          e[r11] = true;
        } catch {
        }
      }
      markAsSingleton(e) {
      }
    }());
  }
  function ee4(r11) {
    return $3?.trackDisposable(r11), r11;
  }
  function te4(r11) {
    $3?.markAsDisposed(r11);
  }
  function H3(r11, e) {
    $3?.setParent(r11, e);
  }
  function mt2(r11) {
    if (ue4.is(r11)) {
      let e = [];
      for (let t of r11) if (t) try {
        t.dispose();
      } catch (i8) {
        e.push(i8);
      }
      if (e.length === 1) throw e[0];
      if (e.length > 1) throw new AggregateError(e, "Encountered errors while disposing of store");
      return Array.isArray(r11) ? [] : r11;
    } else if (r11) return r11.dispose(), r11;
  }
  function Ue2(r11) {
    let e = ee4({ dispose: Ge3(() => {
      te4(e), r11();
    }) });
    return e;
  }
  var X3 = class X4 {
    constructor() {
      this._toDispose = /* @__PURE__ */ new Set();
      this._isDisposed = false;
      ee4(this);
    }
    dispose() {
      this._isDisposed || (te4(this), this._isDisposed = true, this.clear());
    }
    get isDisposed() {
      return this._isDisposed;
    }
    clear() {
      if (this._toDispose.size !== 0) try {
        mt2(this._toDispose);
      } finally {
        this._toDispose.clear();
      }
    }
    add(e) {
      if (!e) return e;
      if (e === this) throw new Error("Cannot register a disposable on itself!");
      return H3(e, this), this._isDisposed ? X4.DISABLE_DISPOSED_WARNING || console.warn(new Error("Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!").stack) : this._toDispose.add(e), e;
    }
    delete(e) {
      if (e) {
        if (e === this) throw new Error("Cannot dispose a disposable on itself!");
        this._toDispose.delete(e), e.dispose();
      }
    }
    deleteAndLeak(e) {
      e && this._toDispose.has(e) && (this._toDispose.delete(e), H3(e, null));
    }
  };
  X3.DISABLE_DISPOSED_WARNING = false;
  var Ie2 = X3;
  var v2 = class {
    constructor() {
      this._store = new Ie2();
      ee4(this), H3(this._store, this);
    }
    dispose() {
      te4(this), this._store.dispose();
    }
    _register(e) {
      if (e === this) throw new Error("Cannot register a disposable on itself!");
      return this._store.add(e);
    }
  };
  v2.None = Object.freeze({ dispose() {
  } });
  var V3 = class {
    constructor() {
      this._isDisposed = false;
      ee4(this);
    }
    get value() {
      return this._isDisposed ? void 0 : this._value;
    }
    set value(e) {
      this._isDisposed || e === this._value || (this._value?.dispose(), e && H3(e, this), this._value = e);
    }
    clear() {
      this.value = void 0;
    }
    dispose() {
      this._isDisposed = true, te4(this), this._value?.dispose(), this._value = void 0;
    }
    clearAndLeak() {
      let e = this._value;
      return this._value = void 0, e && H3(e, null), e;
    }
  };
  var Ct2 = 4096;
  var pe3 = 24;
  var T = class r9 extends v2 {
    constructor(t) {
      super();
      this._terminal = t;
      this._optionsRefresh = this._register(new V3());
      this._oldOpen = this._terminal._core.open, this._terminal._core.open = (i8) => {
        this._oldOpen?.call(this._terminal._core, i8), this._open();
      }, this._terminal._core.screenElement && this._open(), this._optionsRefresh.value = this._terminal._core.optionsService.onOptionChange((i8) => {
        i8 === "fontSize" && (this.rescaleCanvas(), this._renderService?.refreshRows(0, this._terminal.rows));
      }), this._register(Ue2(() => {
        this.removeLayerFromDom(), this._terminal._core && this._oldOpen && (this._terminal._core.open = this._oldOpen, this._oldOpen = void 0), this._renderService && this._oldSetRenderer && (this._renderService.setRenderer = this._oldSetRenderer, this._oldSetRenderer = void 0), this._renderService = void 0, this.canvas = void 0, this._ctx = void 0, this._placeholderBitmap?.close(), this._placeholderBitmap = void 0, this._placeholder = void 0;
      }));
    }
    static createCanvas(t, i8, s) {
      let n = (t || document).createElement("canvas");
      return n.width = i8 | 0, n.height = s | 0, n;
    }
    static createImageData(t, i8, s, n) {
      if (typeof ImageData != "function") {
        let A3 = t.createImageData(i8, s);
        return n && A3.data.set(new Uint8ClampedArray(n, 0, i8 * s * 4)), A3;
      }
      return n ? new ImageData(new Uint8ClampedArray(n, 0, i8 * s * 4), i8, s) : new ImageData(i8, s);
    }
    static createImageBitmap(t) {
      return typeof createImageBitmap != "function" ? Promise.resolve(void 0) : createImageBitmap(t);
    }
    showPlaceholder(t) {
      t ? !this._placeholder && this.cellSize.height !== -1 && this._createPlaceHolder(Math.max(this.cellSize.height + 1, pe3)) : (this._placeholderBitmap?.close(), this._placeholderBitmap = void 0, this._placeholder = void 0), this._renderService?.refreshRows(0, this._terminal.rows);
    }
    get dimensions() {
      return this._renderService?.dimensions;
    }
    get cellSize() {
      return { width: this.dimensions?.css.cell.width || -1, height: this.dimensions?.css.cell.height || -1 };
    }
    clearLines(t, i8) {
      this._ctx?.clearRect(0, t * (this.dimensions?.css.cell.height || 0), this.dimensions?.css.canvas.width || 0, (++i8 - t) * (this.dimensions?.css.cell.height || 0));
    }
    clearAll() {
      this._ctx?.clearRect(0, 0, this.canvas?.width || 0, this.canvas?.height || 0);
    }
    draw(t, i8, s, n, A3 = 1) {
      if (!this._ctx) return;
      let { width: o2, height: a } = this.cellSize;
      if (o2 === -1 || a === -1) return;
      this._rescaleImage(t, o2, a);
      let c = t.actual, h2 = Math.ceil(c.width / o2), l2 = i8 % h2 * o2, I2 = Math.floor(i8 / h2) * a, E = s * o2, C4 = n * a, _4 = A3 * o2 + l2 > c.width ? c.width - l2 : A3 * o2, B4 = I2 + a > c.height ? c.height - I2 : a;
      this._ctx.drawImage(c, Math.floor(l2), Math.floor(I2), Math.ceil(_4), Math.ceil(B4), Math.floor(E), Math.floor(C4), Math.ceil(_4), Math.ceil(B4));
    }
    extractTile(t, i8) {
      let { width: s, height: n } = this.cellSize;
      if (s === -1 || n === -1) return;
      this._rescaleImage(t, s, n);
      let A3 = t.actual, o2 = Math.ceil(A3.width / s), a = i8 % o2 * s, c = Math.floor(i8 / o2) * n, h2 = s + a > A3.width ? A3.width - a : s, l2 = c + n > A3.height ? A3.height - c : n, I2 = r9.createCanvas(this.document, h2, l2), E = I2.getContext("2d");
      if (E) return E.drawImage(A3, Math.floor(a), Math.floor(c), Math.floor(h2), Math.floor(l2), 0, 0, Math.floor(h2), Math.floor(l2)), I2;
    }
    drawPlaceholder(t, i8, s = 1) {
      if (this._ctx) {
        let { width: n, height: A3 } = this.cellSize;
        if (n === -1 || A3 === -1 || (this._placeholder ? A3 >= this._placeholder.height && this._createPlaceHolder(A3 + 1) : this._createPlaceHolder(Math.max(A3 + 1, pe3)), !this._placeholder)) return;
        this._ctx.drawImage(this._placeholderBitmap || this._placeholder, t * n, i8 * A3 % 2 ? 0 : 1, n * s, A3, t * n, i8 * A3, n * s, A3);
      }
    }
    rescaleCanvas() {
      this.canvas && (this.canvas.width !== this.dimensions.css.canvas.width || this.canvas.height !== this.dimensions.css.canvas.height) && (this.canvas.width = this.dimensions.css.canvas.width || 0, this.canvas.height = this.dimensions.css.canvas.height || 0);
    }
    _rescaleImage(t, i8, s) {
      if (i8 === t.actualCellSize.width && s === t.actualCellSize.height) return;
      let { width: n, height: A3 } = t.origCellSize;
      if (i8 === n && s === A3) {
        t.actual = t.orig, t.actualCellSize.width = n, t.actualCellSize.height = A3;
        return;
      }
      let o2 = r9.createCanvas(this.document, Math.ceil(t.orig.width * i8 / n), Math.ceil(t.orig.height * s / A3)), a = o2.getContext("2d");
      a && (a.drawImage(t.orig, 0, 0, o2.width, o2.height), t.actual = o2, t.actualCellSize.width = i8, t.actualCellSize.height = s);
    }
    _open() {
      this._renderService = this._terminal._core._renderService, this._oldSetRenderer = this._renderService.setRenderer.bind(this._renderService), this._renderService.setRenderer = (t) => {
        this.removeLayerFromDom(), this._oldSetRenderer?.call(this._renderService, t);
      };
    }
    insertLayerToDom() {
      this.document && this._terminal._core.screenElement ? this.canvas || (this.canvas = r9.createCanvas(this.document, this.dimensions?.css.canvas.width || 0, this.dimensions?.css.canvas.height || 0), this.canvas.classList.add("xterm-image-layer"), this._terminal._core.screenElement.appendChild(this.canvas), this._ctx = this.canvas.getContext("2d", { alpha: true, desynchronized: true }), this.clearAll()) : console.warn("image addon: cannot insert output canvas to DOM, missing document or screenElement");
    }
    removeLayerFromDom() {
      this.canvas && (this._ctx = void 0, this.canvas.remove(), this.canvas = void 0);
    }
    _createPlaceHolder(t = pe3) {
      this._placeholderBitmap?.close(), this._placeholderBitmap = void 0;
      let i8 = 32, s = r9.createCanvas(this.document, i8, t), n = s.getContext("2d", { alpha: false });
      if (!n) return;
      let A3 = r9.createImageData(n, i8, t), o2 = new Uint32Array(A3.data.buffer), a = (0, fe3.toRGBA8888)(0, 0, 0), c = (0, fe3.toRGBA8888)(255, 255, 255);
      o2.fill(a);
      for (let I2 = 0; I2 < t; ++I2) {
        let E = I2 % 2, C4 = I2 * i8;
        for (let _4 = 0; _4 < i8; _4 += 2) o2[C4 + _4 + E] = c;
      }
      n.putImageData(A3, 0, 0);
      let h2 = screen.width + i8 - 1 & ~(i8 - 1) || Ct2;
      this._placeholder = r9.createCanvas(this.document, h2, t);
      let l2 = this._placeholder.getContext("2d", { alpha: false });
      if (!l2) {
        this._placeholder = void 0;
        return;
      }
      for (let I2 = 0; I2 < h2; I2 += i8) l2.drawImage(s, I2, 0);
      r9.createImageBitmap(this._placeholder).then((I2) => this._placeholderBitmap = I2);
    }
    get document() {
      return this._terminal._core._coreBrowserService?.window.document;
    }
  };
  var S = { width: 7, height: 14 };
  var G3 = class r10 {
    constructor(e = 0, t = 0, i8 = -1, s = -1) {
      this.imageId = i8;
      this.tileId = s;
      this._ext = 0;
      this._urlId = 0;
      this._ext = e, this._urlId = t;
    }
    get ext() {
      return this._urlId ? this._ext & -469762049 | this.underlineStyle << 26 : this._ext;
    }
    set ext(e) {
      this._ext = e;
    }
    get underlineStyle() {
      return this._urlId ? 5 : (this._ext & 469762048) >> 26;
    }
    set underlineStyle(e) {
      this._ext &= -469762049, this._ext |= e << 26 & 469762048;
    }
    get underlineColor() {
      return this._ext & 67108863;
    }
    set underlineColor(e) {
      this._ext &= -67108864, this._ext |= e & 67108863;
    }
    get underlineVariantOffset() {
      let e = (this._ext & 3758096384) >> 29;
      return e < 0 ? e ^ 4294967288 : e;
    }
    set underlineVariantOffset(e) {
      this._ext &= 536870911, this._ext |= e << 29 & 3758096384;
    }
    get urlId() {
      return this._urlId;
    }
    set urlId(e) {
      this._urlId = e;
    }
    clone() {
      return new r10(this._ext, this._urlId, this.imageId, this.tileId);
    }
    isEmpty() {
      return this.underlineStyle === 0 && this._urlId === 0 && this.imageId === -1;
    }
  };
  var F2 = new G3();
  var ie4 = class {
    constructor(e, t, i8) {
      this._terminal = e;
      this._renderer = t;
      this._opts = i8;
      this._images = /* @__PURE__ */ new Map();
      this._lastId = 0;
      this._lowestId = 0;
      this._fullyCleared = false;
      this._needsFullClear = false;
      this._pixelLimit = 25e5;
      try {
        this.setLimit(this._opts.storageLimit);
      } catch (s) {
        console.error(s.message), console.warn(`storageLimit is set to ${this.getLimit()} MB`);
      }
      this._viewportMetrics = { cols: this._terminal.cols, rows: this._terminal.rows };
    }
    dispose() {
      this.reset();
    }
    reset() {
      for (let e of this._images.values()) e.marker?.dispose();
      this._images.clear(), this._renderer.clearAll();
    }
    getLimit() {
      return this._pixelLimit * 4 / 1e6;
    }
    setLimit(e) {
      if (e < 0.5 || e > 1e3) throw RangeError("invalid storageLimit, should be at least 0.5 MB and not exceed 1G");
      this._pixelLimit = e / 4 * 1e6 >>> 0, this._evictOldest(0);
    }
    getUsage() {
      return this._getStoredPixels() * 4 / 1e6;
    }
    _getStoredPixels() {
      let e = 0;
      for (let t of this._images.values()) t.orig && (e += t.orig.width * t.orig.height, t.actual && t.actual !== t.orig && (e += t.actual.width * t.actual.height));
      return e;
    }
    _delImg(e) {
      let t = this._images.get(e);
      this._images.delete(e), t && window.ImageBitmap && t.orig instanceof ImageBitmap && t.orig.close();
    }
    wipeAlternate() {
      let e = [];
      for (let [t, i8] of this._images.entries()) i8.bufferType === "alternate" && (i8.marker?.dispose(), e.push(t));
      for (let t of e) this._delImg(t);
      this._needsFullClear = true, this._fullyCleared = false;
    }
    advanceCursor(e) {
      if (this._opts.sixelScrolling) {
        let t = this._renderer.cellSize;
        (t.width === -1 || t.height === -1) && (t = S);
        let i8 = Math.ceil(e / t.height);
        for (let s = 1; s < i8; ++s) this._terminal._core._inputHandler.lineFeed();
      }
    }
    addImage(e) {
      this._evictOldest(e.width * e.height);
      let t = this._renderer.cellSize;
      (t.width === -1 || t.height === -1) && (t = S);
      let i8 = Math.ceil(e.width / t.width), s = Math.ceil(e.height / t.height), n = ++this._lastId, A3 = this._terminal._core.buffer, o2 = this._terminal.cols, a = this._terminal.rows, c = A3.x, h2 = A3.y, l2 = c, I2 = 0;
      this._opts.sixelScrolling || (A3.x = 0, A3.y = 0, l2 = 0), this._terminal._core._inputHandler._dirtyRowTracker.markDirty(A3.y);
      for (let B4 = 0; B4 < s; ++B4) {
        let y = A3.lines.get(A3.y + A3.ybase);
        for (let k4 = 0; k4 < i8 && !(l2 + k4 >= o2); ++k4) this._writeToCell(y, l2 + k4, n, B4 * i8 + k4), I2++;
        if (this._opts.sixelScrolling) B4 < s - 1 && this._terminal._core._inputHandler.lineFeed();
        else if (++A3.y >= a) break;
        A3.x = l2;
      }
      this._terminal._core._inputHandler._dirtyRowTracker.markDirty(A3.y), this._opts.sixelScrolling ? A3.x = l2 : (A3.x = c, A3.y = h2);
      let E = [];
      for (let [B4, y] of this._images.entries()) y.tileCount < 1 && (y.marker?.dispose(), E.push(B4));
      for (let B4 of E) this._delImg(B4);
      let C4 = this._terminal.registerMarker(0);
      C4?.onDispose(() => {
        this._images.get(n) && this._delImg(n);
      }), this._terminal.buffer.active.type === "alternate" && this._evictOnAlternate();
      let _4 = { orig: e, origCellSize: t, actual: e, actualCellSize: { ...t }, marker: C4 || void 0, tileCount: I2, bufferType: this._terminal.buffer.active.type };
      this._images.set(n, _4);
    }
    render(e) {
      if (!this._renderer.canvas && this._images.size && (this._renderer.insertLayerToDom(), !this._renderer.canvas)) return;
      if (this._renderer.rescaleCanvas(), !this._images.size) {
        this._fullyCleared || (this._renderer.clearAll(), this._fullyCleared = true, this._needsFullClear = false), this._renderer.canvas && this._renderer.removeLayerFromDom();
        return;
      }
      this._needsFullClear && (this._renderer.clearAll(), this._fullyCleared = true, this._needsFullClear = false);
      let { start: t, end: i8 } = e, s = this._terminal._core.buffer, n = this._terminal._core.cols;
      this._renderer.clearLines(t, i8);
      for (let A3 = t; A3 <= i8; ++A3) {
        let o2 = s.lines.get(A3 + s.ydisp);
        if (!o2) return;
        for (let a = 0; a < n; ++a) if (o2.getBg(a) & 268435456) {
          let c = o2._extendedAttrs[a] || F2, h2 = c.imageId;
          if (h2 === void 0 || h2 === -1) continue;
          let l2 = this._images.get(h2);
          if (c.tileId !== -1) {
            let I2 = c.tileId, E = a, C4 = 1;
            for (; ++a < n && o2.getBg(a) & 268435456 && (c = o2._extendedAttrs[a] || F2) && c.imageId === h2 && c.tileId === I2 + C4; ) C4++;
            a--, l2 ? l2.actual && this._renderer.draw(l2, I2, E, A3, C4) : this._opts.showPlaceholder && this._renderer.drawPlaceholder(E, A3, C4), this._fullyCleared = false;
          }
        }
      }
    }
    viewportResize(e) {
      if (!this._images.size) {
        this._viewportMetrics = e;
        return;
      }
      if (this._viewportMetrics.cols >= e.cols) {
        this._viewportMetrics = e;
        return;
      }
      let t = this._terminal._core.buffer, i8 = t.lines.length, s = this._viewportMetrics.cols - 1;
      for (let n = 0; n < i8; ++n) {
        let A3 = t.lines.get(n);
        if (A3.getBg(s) & 268435456) {
          let o2 = A3._extendedAttrs[s] || F2, a = o2.imageId;
          if (a === void 0 || a === -1) continue;
          let c = this._images.get(a);
          if (!c) continue;
          let h2 = Math.ceil((c.actual?.width || 0) / c.actualCellSize.width);
          if (o2.tileId % h2 + 1 >= h2) continue;
          let l2 = false;
          for (let C4 = s + 1; C4 > e.cols; ++C4) if (A3._data[C4 * 3 + 0] & 4194303) {
            l2 = true;
            break;
          }
          if (l2) continue;
          let I2 = Math.min(e.cols, h2 - o2.tileId % h2 + s), E = o2.tileId;
          for (let C4 = s + 1; C4 < I2; ++C4) this._writeToCell(A3, C4, a, ++E), c.tileCount++;
        }
      }
      this._viewportMetrics = e;
    }
    getImageAtBufferCell(e, t) {
      let s = this._terminal._core.buffer.lines.get(t);
      if (s && s.getBg(e) & 268435456) {
        let n = s._extendedAttrs[e] || F2;
        if (n.imageId && n.imageId !== -1) {
          let A3 = this._images.get(n.imageId)?.orig;
          if (window.ImageBitmap && A3 instanceof ImageBitmap) {
            let o2 = T.createCanvas(window.document, A3.width, A3.height);
            return o2.getContext("2d")?.drawImage(A3, 0, 0, A3.width, A3.height), o2;
          }
          return A3;
        }
      }
    }
    extractTileAtBufferCell(e, t) {
      let s = this._terminal._core.buffer.lines.get(t);
      if (s && s.getBg(e) & 268435456) {
        let n = s._extendedAttrs[e] || F2;
        if (n.imageId && n.imageId !== -1 && n.tileId !== -1) {
          let A3 = this._images.get(n.imageId);
          if (A3) return this._renderer.extractTile(A3, n.tileId);
        }
      }
    }
    _evictOldest(e) {
      let t = this._getStoredPixels(), i8 = t;
      for (; this._pixelLimit < i8 + e && this._images.size; ) {
        let s = this._images.get(++this._lowestId);
        s && s.orig && (i8 -= s.orig.width * s.orig.height, s.actual && s.orig !== s.actual && (i8 -= s.actual.width * s.actual.height), s.marker?.dispose(), this._delImg(this._lowestId));
      }
      return t - i8;
    }
    _writeToCell(e, t, i8, s) {
      if (e._data[t * 3 + 2] & 268435456) {
        let n = e._extendedAttrs[t];
        if (n) {
          if (n.imageId !== void 0) {
            let A3 = this._images.get(n.imageId);
            A3 && A3.tileCount--, n.imageId = i8, n.tileId = s;
            return;
          }
          e._extendedAttrs[t] = new G3(n.ext, n.urlId, i8, s);
          return;
        }
      }
      e._data[t * 3 + 2] |= 268435456, e._extendedAttrs[t] = new G3(0, 0, i8, s);
    }
    _evictOnAlternate() {
      for (let i8 of this._images.values()) i8.bufferType === "alternate" && (i8.tileCount = 0);
      let e = this._terminal._core.buffer;
      for (let i8 = 0; i8 < this._terminal.rows; ++i8) {
        let s = e.lines.get(i8);
        if (s) {
          for (let n = 0; n < this._terminal.cols; ++n) if (s._data[n * 3 + 2] & 268435456) {
            let A3 = s._extendedAttrs[n]?.imageId;
            if (A3) {
              let o2 = this._images.get(A3);
              o2 && o2.tileCount++;
            }
          }
        }
      }
      let t = [];
      for (let [i8, s] of this._images.entries()) s.bufferType === "alternate" && !s.tileCount && (s.marker?.dispose(), t.push(i8));
      for (let i8 of t) this._delImg(i8);
    }
  };
  var qe3 = Y3(Oe3());
  function se2(r11) {
    let e = "";
    for (let t = 0; t < r11.length; ++t) e += String.fromCharCode(r11[t]);
    return e;
  }
  function Ee3(r11) {
    let e = 0;
    for (let t = 0; t < r11.length; ++t) {
      if (r11[t] < 48 || r11[t] > 57) throw new Error("illegal char");
      e = e * 10 + r11[t] - 48;
    }
    return e;
  }
  function Pe3(r11) {
    let e = se2(r11);
    if (!e.match(/^((auto)|(\d+?((px)|(%)){0,1}))$/)) throw new Error("illegal size");
    return e;
  }
  function yt2(r11) {
    if (typeof Buffer < "u") return Buffer.from(se2(r11), "base64").toString();
    let e = atob(se2(r11)), t = new Uint8Array(e.length);
    for (let i8 = 0; i8 < t.length; ++i8) t[i8] = e.charCodeAt(i8);
    return new TextDecoder().decode(t);
  }
  var Ye3 = { inline: Ee3, size: Ee3, name: yt2, width: Pe3, height: Pe3, preserveAspectRatio: Ee3 };
  var We3 = [70, 105, 108, 101];
  var Be3 = 1024;
  var ne3 = class {
    constructor() {
      this.state = 0;
      this._buffer = new Uint32Array(Be3);
      this._position = 0;
      this._key = "";
      this.fields = {};
    }
    reset() {
      this._buffer.fill(0), this.state = 0, this._position = 0, this.fields = {}, this._key = "";
    }
    parse(e, t, i8) {
      let s = this.state, n = this._position, A3 = this._buffer;
      if (s === 1 || s === 4 || s === 0 && n > 6) return -1;
      for (let o2 = t; o2 < i8; ++o2) {
        let a = e[o2];
        switch (a) {
          case 59:
            if (!this._storeValue(n)) return this._a();
            s = 2, n = 0;
            break;
          case 61:
            if (s === 0) {
              for (let c = 0; c < We3.length; ++c) if (A3[c] !== We3[c]) return this._a();
              s = 2, n = 0;
            } else if (s === 2) {
              if (!this._storeKey(n)) return this._a();
              s = 3, n = 0;
            } else if (s === 3) {
              if (n >= Be3) return this._a();
              A3[n++] = a;
            }
            break;
          case 58:
            return s === 3 && !this._storeValue(n) ? this._a() : (this.state = 4, o2 + 1);
          default:
            if (n >= Be3) return this._a();
            A3[n++] = a;
        }
      }
      return this.state = s, this._position = n, -2;
    }
    _a() {
      return this.state = 1, -1;
    }
    _storeKey(e) {
      let t = se2(this._buffer.subarray(0, e));
      return t ? (this._key = t, this.fields[t] = null, true) : false;
    }
    _storeValue(e) {
      if (this._key) {
        try {
          let t = this._buffer.slice(0, e);
          this.fields[this._key] = Ye3[this._key] ? Ye3[this._key](t) : t;
        } catch {
          return false;
        }
        return true;
      }
      return false;
    }
  };
  var J2 = { mime: "unsupported", width: 0, height: 0 };
  function ze2(r11) {
    if (r11.length < 24) return J2;
    let e = new Uint32Array(r11.buffer, r11.byteOffset, 6);
    if (e[0] === 1196314761 && e[1] === 169478669 && e[3] === 1380206665) return { mime: "image/png", width: r11[16] << 24 | r11[17] << 16 | r11[18] << 8 | r11[19], height: r11[20] << 24 | r11[21] << 16 | r11[22] << 8 | r11[23] };
    if (r11[0] === 255 && r11[1] === 216 && r11[2] === 255) {
      let [t, i8] = vt2(r11);
      return { mime: "image/jpeg", width: t, height: i8 };
    }
    return e[0] === 944130375 && (r11[4] === 55 || r11[4] === 57) && r11[5] === 97 ? { mime: "image/gif", width: r11[7] << 8 | r11[6], height: r11[9] << 8 | r11[8] } : J2;
  }
  function vt2(r11) {
    let e = r11.length, t = 4, i8 = r11[t] << 8 | r11[t + 1];
    for (; ; ) {
      if (t += i8, t >= e) return [0, 0];
      if (r11[t] !== 255) return [0, 0];
      if (r11[t + 1] === 192 || r11[t + 1] === 194) return t + 8 < e ? [r11[t + 7] << 8 | r11[t + 8], r11[t + 5] << 8 | r11[t + 6]] : [0, 0];
      t += 2, i8 = r11[t] << 8 | r11[t + 1];
    }
  }
  var St2 = 4194304;
  var Qe2 = { name: "Unnamed file", size: 0, width: "auto", height: "auto", preserveAspectRatio: 1, inline: 0 };
  var Ae3 = class {
    constructor(e, t, i8, s) {
      this._opts = e;
      this._renderer = t;
      this._storage = i8;
      this._coreTerminal = s;
      this._aborted = false;
      this._hp = new ne3();
      this._header = Qe2;
      this._dec = new qe3.default(St2);
      this._metrics = J2;
    }
    reset() {
    }
    start() {
      this._aborted = false, this._header = Qe2, this._metrics = J2, this._hp.reset();
    }
    put(e, t, i8) {
      if (!this._aborted) if (this._hp.state === 4) this._dec.put(e, t, i8) && (this._dec.release(), this._aborted = true);
      else {
        let s = this._hp.parse(e, t, i8);
        if (s === -1) {
          this._aborted = true;
          return;
        }
        if (s > 0) {
          if (this._header = Object.assign({}, Qe2, this._hp.fields), !this._header.inline || !this._header.size || this._header.size > this._opts.iipSizeLimit) {
            this._aborted = true;
            return;
          }
          this._dec.init(this._header.size), this._dec.put(e, s, i8) && (this._dec.release(), this._aborted = true);
        }
      }
    }
    end(e) {
      if (this._aborted) return true;
      let t = 0, i8 = 0, s = true;
      if ((s = e) && (s = !this._dec.end()) && (this._metrics = ze2(this._dec.data8), (s = this._metrics.mime !== "unsupported") && (t = this._metrics.width, i8 = this._metrics.height, (s = t && i8 && t * i8 < this._opts.pixelLimit) && ([t, i8] = this._resize(t, i8).map(Math.floor), s = t && i8 && t * i8 < this._opts.pixelLimit))), !s) return this._dec.release(), true;
      let n = new Blob([this._dec.data8], { type: this._metrics.mime });
      if (this._dec.release(), !window.createImageBitmap) {
        let A3 = URL.createObjectURL(n), o2 = new Image();
        return new Promise((a) => {
          o2.addEventListener("load", () => {
            URL.revokeObjectURL(A3);
            let c = T.createCanvas(window.document, t, i8);
            c.getContext("2d")?.drawImage(o2, 0, 0, t, i8), this._storage.addImage(c), a(true);
          }), o2.src = A3, setTimeout(() => a(true), 1e3);
        });
      }
      return createImageBitmap(n, { resizeWidth: t, resizeHeight: i8 }).then((A3) => (this._storage.addImage(A3), true));
    }
    _resize(e, t) {
      let i8 = this._renderer.dimensions?.css.cell.width || S.width, s = this._renderer.dimensions?.css.cell.height || S.height, n = this._renderer.dimensions?.css.canvas.width || i8 * this._coreTerminal.cols, A3 = this._renderer.dimensions?.css.canvas.height || s * this._coreTerminal.rows, o2 = this._dim(this._header.width, n, i8), a = this._dim(this._header.height, A3, s);
      if (!o2 && !a) {
        let c = n / e, h2 = (A3 - s) / t, l2 = Math.min(c, h2);
        return l2 < 1 ? [e * l2, t * l2] : [e, t];
      }
      return o2 ? this._header.preserveAspectRatio || !o2 || !a ? [o2, t * o2 / e] : [o2, a] : [e * a / t, a];
    }
    _dim(e, t, i8) {
      return e === "auto" ? 0 : e.endsWith("%") ? parseInt(e.slice(0, -1)) * t / 100 : e.endsWith("px") ? parseInt(e.slice(0, -2)) : parseInt(e) * i8;
    }
  };
  var w3 = Y3(W2());
  var $e2 = Y3(Xe3());
  var Nt2 = 4194304;
  var De3 = w3.PALETTE_ANSI_256;
  De3.set(w3.PALETTE_VT340_COLOR);
  var ce3 = class {
    constructor(e, t, i8) {
      this._opts = e;
      this._storage = t;
      this._coreTerminal = i8;
      this._size = 0;
      this._aborted = false;
      (0, $e2.DecoderAsync)({ memoryLimit: this._opts.pixelLimit * 4, palette: De3, paletteLimit: this._opts.sixelPaletteLimit }).then((s) => this._dec = s);
    }
    reset() {
      this._dec && (this._dec.release(), this._dec._palette.fill(0), this._dec.init(0, De3, this._opts.sixelPaletteLimit));
    }
    hook(e) {
      if (this._size = 0, this._aborted = false, this._dec) {
        let t = e.params[1] === 1 ? 0 : Ht(this._coreTerminal._core._inputHandler._curAttrData, this._coreTerminal._core._themeService?.colors);
        this._dec.init(t, null, this._opts.sixelPaletteLimit);
      }
    }
    put(e, t, i8) {
      if (!(this._aborted || !this._dec)) {
        if (this._size += i8 - t, this._size > this._opts.sixelSizeLimit) {
          console.warn("SIXEL: too much data, aborting"), this._aborted = true, this._dec.release();
          return;
        }
        try {
          this._dec.decode(e, t, i8);
        } catch (s) {
          console.warn(`SIXEL: error while decoding image - ${s}`), this._aborted = true, this._dec.release();
        }
      }
    }
    unhook(e) {
      if (this._aborted || !e || !this._dec) return true;
      let t = this._dec.width, i8 = this._dec.height;
      if (!t || !i8) return i8 && this._storage.advanceCursor(i8), true;
      let s = T.createCanvas(void 0, t, i8);
      return s.getContext("2d")?.putImageData(new ImageData(this._dec.data8, t, i8), 0, 0), this._dec.memoryUsage > Nt2 && this._dec.release(), this._storage.addImage(s), true;
    }
  };
  function Ht(r11, e) {
    let t = 0;
    if (!e) return t;
    if (r11.isInverse()) if (r11.isFgDefault()) t = le2(e.foreground.rgba);
    else if (r11.isFgRGB()) {
      let i8 = r11.constructor.toColorRGB(r11.getFgColor());
      t = (0, w3.toRGBA8888)(...i8);
    } else t = le2(e.ansi[r11.getFgColor()].rgba);
    else if (r11.isBgDefault()) t = le2(e.background.rgba);
    else if (r11.isBgRGB()) {
      let i8 = r11.constructor.toColorRGB(r11.getBgColor());
      t = (0, w3.toRGBA8888)(...i8);
    } else t = le2(e.ansi[r11.getBgColor()].rgba);
    return t;
  }
  function le2(r11) {
    return w3.BIG_ENDIAN ? r11 : (r11 & 255) << 24 | (r11 >>> 8 & 255) << 16 | (r11 >>> 16 & 255) << 8 | r11 >>> 24 & 255;
  }
  var et2 = { enableSizeReports: true, pixelLimit: 16777216, sixelSupport: true, sixelScrolling: true, sixelPaletteLimit: 256, sixelSizeLimit: 25e6, storageLimit: 128, showPlaceholder: true, iipSupport: true, iipSizeLimit: 2e7 };
  var tt3 = 4096;
  var it3 = class {
    constructor(e) {
      this._disposables = [];
      this._handlers = /* @__PURE__ */ new Map();
      this._opts = Object.assign({}, et2, e), this._defaultOpts = Object.assign({}, et2, e);
    }
    dispose() {
      for (let e of this._disposables) e.dispose();
      this._disposables.length = 0, this._handlers.clear();
    }
    _disposeLater(...e) {
      for (let t of e) this._disposables.push(t);
    }
    activate(e) {
      if (this._terminal = e, this._renderer = new T(e), this._storage = new ie4(e, this._renderer, this._opts), this._opts.enableSizeReports) {
        let t = e.options.windowOptions || {};
        t.getWinSizePixels = true, t.getCellSizePixels = true, t.getWinSizeChars = true, e.options.windowOptions = t;
      }
      if (this._disposeLater(this._renderer, this._storage, e.parser.registerCsiHandler({ prefix: "?", final: "h" }, (t) => this._decset(t)), e.parser.registerCsiHandler({ prefix: "?", final: "l" }, (t) => this._decrst(t)), e.parser.registerCsiHandler({ final: "c" }, (t) => this._da1(t)), e.parser.registerCsiHandler({ prefix: "?", final: "S" }, (t) => this._xtermGraphicsAttributes(t)), e.onRender((t) => this._storage?.render(t)), e.parser.registerCsiHandler({ intermediates: "!", final: "p" }, () => this.reset()), e.parser.registerEscHandler({ final: "c" }, () => this.reset()), e._core._inputHandler.onRequestReset(() => this.reset()), e.buffer.onBufferChange(() => this._storage?.wipeAlternate()), e.onResize((t) => this._storage?.viewportResize(t))), this._opts.sixelSupport) {
        let t = new ce3(this._opts, this._storage, e);
        this._handlers.set("sixel", t), this._disposeLater(e._core._inputHandler._parser.registerDcsHandler({ final: "q" }, t));
      }
      if (this._opts.iipSupport) {
        let t = new Ae3(this._opts, this._renderer, this._storage, e);
        this._handlers.set("iip", t), this._disposeLater(e._core._inputHandler._parser.registerOscHandler(1337, t));
      }
    }
    reset() {
      this._opts.sixelScrolling = this._defaultOpts.sixelScrolling, this._opts.sixelPaletteLimit = this._defaultOpts.sixelPaletteLimit, this._storage?.reset();
      for (let e of this._handlers.values()) e.reset();
      return false;
    }
    get storageLimit() {
      return this._storage?.getLimit() || -1;
    }
    set storageLimit(e) {
      this._storage?.setLimit(e), this._opts.storageLimit = e;
    }
    get storageUsage() {
      return this._storage ? this._storage.getUsage() : -1;
    }
    get showPlaceholder() {
      return this._opts.showPlaceholder;
    }
    set showPlaceholder(e) {
      this._opts.showPlaceholder = e, this._renderer?.showPlaceholder(e);
    }
    getImageAtBufferCell(e, t) {
      return this._storage?.getImageAtBufferCell(e, t);
    }
    extractTileAtBufferCell(e, t) {
      return this._storage?.extractTileAtBufferCell(e, t);
    }
    _report(e) {
      this._terminal?._core.coreService.triggerDataEvent(e);
    }
    _decset(e) {
      for (let t = 0; t < e.length; ++t) switch (e[t]) {
        case 80:
          this._opts.sixelScrolling = false;
          break;
      }
      return false;
    }
    _decrst(e) {
      for (let t = 0; t < e.length; ++t) switch (e[t]) {
        case 80:
          this._opts.sixelScrolling = true;
          break;
      }
      return false;
    }
    _da1(e) {
      return e[0] ? true : this._opts.sixelSupport ? (this._report("\x1B[?62;4;9;22c"), true) : false;
    }
    _xtermGraphicsAttributes(e) {
      if (e.length < 2) return true;
      if (e[0] === 1) switch (e[1]) {
        case 1:
          return this._report(`\x1B[?${e[0]};0;${this._opts.sixelPaletteLimit}S`), true;
        case 2:
          this._opts.sixelPaletteLimit = this._defaultOpts.sixelPaletteLimit, this._report(`\x1B[?${e[0]};0;${this._opts.sixelPaletteLimit}S`);
          for (let t of this._handlers.values()) t.reset();
          return true;
        case 3:
          return e.length > 2 && !(e[2] instanceof Array) && e[2] <= tt3 ? (this._opts.sixelPaletteLimit = e[2], this._report(`\x1B[?${e[0]};0;${this._opts.sixelPaletteLimit}S`)) : this._report(`\x1B[?${e[0]};2S`), true;
        case 4:
          return this._report(`\x1B[?${e[0]};0;${tt3}S`), true;
        default:
          return this._report(`\x1B[?${e[0]};2S`), true;
      }
      if (e[0] === 2) switch (e[1]) {
        case 1:
          let t = this._renderer?.dimensions?.css.canvas.width, i8 = this._renderer?.dimensions?.css.canvas.height;
          if (!t || !i8) {
            let n = S;
            t = (this._terminal?.cols || 80) * n.width, i8 = (this._terminal?.rows || 24) * n.height;
          }
          if (t * i8 < this._opts.pixelLimit) this._report(`\x1B[?${e[0]};0;${t.toFixed(0)};${i8.toFixed(0)}S`);
          else {
            let n = Math.floor(Math.sqrt(this._opts.pixelLimit));
            this._report(`\x1B[?${e[0]};0;${n};${n}S`);
          }
          return true;
        case 4:
          let s = Math.floor(Math.sqrt(this._opts.pixelLimit));
          return this._report(`\x1B[?${e[0]};0;${s};${s}S`), true;
        default:
          return this._report(`\x1B[?${e[0]};2S`), true;
      }
      return this._report(`\x1B[?${e[0]};1S`), true;
    }
  };

  // node_modules/@xterm/addon-webgl/lib/addon-webgl.mjs
  var Lr = Object.defineProperty;
  var wr = Object.getOwnPropertyDescriptor;
  var Yi = (i8, e, t, n) => {
    for (var s = n > 1 ? void 0 : n ? wr(e, t) : e, o2 = i8.length - 1, r11; o2 >= 0; o2--) (r11 = i8[o2]) && (s = (n ? r11(e, t, s) : r11(s)) || s);
    return n && s && Lr(e, t, s), s;
  };
  var Qi = (i8, e) => (t, n) => e(t, n, i8);
  var pi = class {
    constructor() {
      this.listeners = [], this.unexpectedErrorHandler = function(e) {
        setTimeout(() => {
          throw e.stack ? bt2.isErrorNoTelemetry(e) ? new bt2(e.message + `

` + e.stack) : new Error(e.message + `

` + e.stack) : e;
        }, 0);
      };
    }
    addListener(e) {
      return this.listeners.push(e), () => {
        this._removeListener(e);
      };
    }
    emit(e) {
      this.listeners.forEach((t) => {
        t(e);
      });
    }
    _removeListener(e) {
      this.listeners.splice(this.listeners.indexOf(e), 1);
    }
    setUnexpectedErrorHandler(e) {
      this.unexpectedErrorHandler = e;
    }
    getUnexpectedErrorHandler() {
      return this.unexpectedErrorHandler;
    }
    onUnexpectedError(e) {
      this.unexpectedErrorHandler(e), this.emit(e);
    }
    onUnexpectedExternalError(e) {
      this.unexpectedErrorHandler(e);
    }
  };
  var Rr = new pi();
  function Pe4(i8) {
    Dr(i8) || Rr.onUnexpectedError(i8);
  }
  var fi = "Canceled";
  function Dr(i8) {
    return i8 instanceof Ye4 ? true : i8 instanceof Error && i8.name === fi && i8.message === fi;
  }
  var Ye4 = class extends Error {
    constructor() {
      super(fi), this.name = this.message;
    }
  };
  var bt2 = class i extends Error {
    constructor(e) {
      super(e), this.name = "CodeExpectedError";
    }
    static fromError(e) {
      if (e instanceof i) return e;
      let t = new i();
      return t.message = e.message, t.stack = e.stack, t;
    }
    static isErrorNoTelemetry(e) {
      return e.name === "CodeExpectedError";
    }
  };
  function Mr(i8, e, t = 0, n = i8.length) {
    let s = t, o2 = n;
    for (; s < o2; ) {
      let r11 = Math.floor((s + o2) / 2);
      e(i8[r11]) ? s = r11 + 1 : o2 = r11;
    }
    return s - 1;
  }
  var vt3 = class vt4 {
    constructor(e) {
      this._array = e;
      this._findLastMonotonousLastIdx = 0;
    }
    findLastMonotonous(e) {
      if (vt4.assertInvariants) {
        if (this._prevFindLastPredicate) {
          for (let n of this._array) if (this._prevFindLastPredicate(n) && !e(n)) throw new Error("MonotonousArray: current predicate must be weaker than (or equal to) the previous predicate.");
        }
        this._prevFindLastPredicate = e;
      }
      let t = Mr(this._array, e, this._findLastMonotonousLastIdx);
      return this._findLastMonotonousLastIdx = t + 1, t === -1 ? void 0 : this._array[t];
    }
  };
  vt3.assertInvariants = false;
  var en;
  ((a) => {
    function i8(l2) {
      return l2 < 0;
    }
    a.isLessThan = i8;
    function e(l2) {
      return l2 <= 0;
    }
    a.isLessThanOrEqual = e;
    function t(l2) {
      return l2 > 0;
    }
    a.isGreaterThan = t;
    function n(l2) {
      return l2 === 0;
    }
    a.isNeitherLessOrGreaterThan = n, a.greaterThan = 1, a.lessThan = -1, a.neitherLessOrGreaterThan = 0;
  })(en || (en = {}));
  function tn(i8, e) {
    return (t, n) => e(i8(t), i8(n));
  }
  var nn = (i8, e) => i8 - e;
  var Be4 = class Be5 {
    constructor(e) {
      this.iterate = e;
    }
    forEach(e) {
      this.iterate((t) => (e(t), true));
    }
    toArray() {
      let e = [];
      return this.iterate((t) => (e.push(t), true)), e;
    }
    filter(e) {
      return new Be5((t) => this.iterate((n) => e(n) ? t(n) : true));
    }
    map(e) {
      return new Be5((t) => this.iterate((n) => t(e(n))));
    }
    some(e) {
      let t = false;
      return this.iterate((n) => (t = e(n), !t)), t;
    }
    findFirst(e) {
      let t;
      return this.iterate((n) => e(n) ? (t = n, false) : true), t;
    }
    findLast(e) {
      let t;
      return this.iterate((n) => (e(n) && (t = n), true)), t;
    }
    findLastMaxBy(e) {
      let t, n = true;
      return this.iterate((s) => ((n || en.isGreaterThan(e(s, t))) && (n = false, t = s), true)), t;
    }
  };
  Be4.empty = new Be4((e) => {
  });
  function an(i8, e) {
    let t = /* @__PURE__ */ Object.create(null);
    for (let n of i8) {
      let s = e(n), o2 = t[s];
      o2 || (o2 = t[s] = []), o2.push(n);
    }
    return t;
  }
  var sn;
  var on;
  var rn = class {
    constructor(e, t) {
      this.toKey = t;
      this._map = /* @__PURE__ */ new Map();
      this[sn] = "SetWithKey";
      for (let n of e) this.add(n);
    }
    get size() {
      return this._map.size;
    }
    add(e) {
      let t = this.toKey(e);
      return this._map.set(t, e), this;
    }
    delete(e) {
      return this._map.delete(this.toKey(e));
    }
    has(e) {
      return this._map.has(this.toKey(e));
    }
    *entries() {
      for (let e of this._map.values()) yield [e, e];
    }
    keys() {
      return this.values();
    }
    *values() {
      for (let e of this._map.values()) yield e;
    }
    clear() {
      this._map.clear();
    }
    forEach(e, t) {
      this._map.forEach((n) => e.call(t, n, n, this));
    }
    [(on = Symbol.iterator, sn = Symbol.toStringTag, on)]() {
      return this.values();
    }
  };
  var Tt2 = class {
    constructor() {
      this.map = /* @__PURE__ */ new Map();
    }
    add(e, t) {
      let n = this.map.get(e);
      n || (n = /* @__PURE__ */ new Set(), this.map.set(e, n)), n.add(t);
    }
    delete(e, t) {
      let n = this.map.get(e);
      n && (n.delete(t), n.size === 0 && this.map.delete(e));
    }
    forEach(e, t) {
      let n = this.map.get(e);
      n && n.forEach(t);
    }
    get(e) {
      let t = this.map.get(e);
      return t || /* @__PURE__ */ new Set();
    }
  };
  function mi(i8, e) {
    let t = this, n = false, s;
    return function() {
      if (n) return s;
      if (n = true, e) try {
        s = i8.apply(t, arguments);
      } finally {
        e();
      }
      else s = i8.apply(t, arguments);
      return s;
    };
  }
  var _i;
  ((W3) => {
    function i8(E) {
      return E && typeof E == "object" && typeof E[Symbol.iterator] == "function";
    }
    W3.is = i8;
    let e = Object.freeze([]);
    function t() {
      return e;
    }
    W3.empty = t;
    function* n(E) {
      yield E;
    }
    W3.single = n;
    function s(E) {
      return i8(E) ? E : n(E);
    }
    W3.wrap = s;
    function o2(E) {
      return E || e;
    }
    W3.from = o2;
    function* r11(E) {
      for (let y = E.length - 1; y >= 0; y--) yield E[y];
    }
    W3.reverse = r11;
    function a(E) {
      return !E || E[Symbol.iterator]().next().done === true;
    }
    W3.isEmpty = a;
    function l2(E) {
      return E[Symbol.iterator]().next().value;
    }
    W3.first = l2;
    function u(E, y) {
      let w4 = 0;
      for (let G4 of E) if (y(G4, w4++)) return true;
      return false;
    }
    W3.some = u;
    function c(E, y) {
      for (let w4 of E) if (y(w4)) return w4;
    }
    W3.find = c;
    function* d(E, y) {
      for (let w4 of E) y(w4) && (yield w4);
    }
    W3.filter = d;
    function* h2(E, y) {
      let w4 = 0;
      for (let G4 of E) yield y(G4, w4++);
    }
    W3.map = h2;
    function* f(E, y) {
      let w4 = 0;
      for (let G4 of E) yield* y(G4, w4++);
    }
    W3.flatMap = f;
    function* I2(...E) {
      for (let y of E) yield* y;
    }
    W3.concat = I2;
    function L2(E, y, w4) {
      let G4 = w4;
      for (let ue5 of E) G4 = y(G4, ue5);
      return G4;
    }
    W3.reduce = L2;
    function* M6(E, y, w4 = E.length) {
      for (y < 0 && (y += E.length), w4 < 0 ? w4 += E.length : w4 > E.length && (w4 = E.length); y < w4; y++) yield E[y];
    }
    W3.slice = M6;
    function q3(E, y = Number.POSITIVE_INFINITY) {
      let w4 = [];
      if (y === 0) return [w4, E];
      let G4 = E[Symbol.iterator]();
      for (let ue5 = 0; ue5 < y; ue5++) {
        let Se2 = G4.next();
        if (Se2.done) return [w4, W3.empty()];
        w4.push(Se2.value);
      }
      return [w4, { [Symbol.iterator]() {
        return G4;
      } }];
    }
    W3.consume = q3;
    async function S2(E) {
      let y = [];
      for await (let w4 of E) y.push(w4);
      return Promise.resolve(y);
    }
    W3.asyncToArray = S2;
  })(_i || (_i = {}));
  var Ar = false;
  var Ne3 = null;
  var gt2 = class gt3 {
    constructor() {
      this.livingDisposables = /* @__PURE__ */ new Map();
    }
    getDisposableData(e) {
      let t = this.livingDisposables.get(e);
      return t || (t = { parent: null, source: null, isSingleton: false, value: e, idx: gt3.idx++ }, this.livingDisposables.set(e, t)), t;
    }
    trackDisposable(e) {
      let t = this.getDisposableData(e);
      t.source || (t.source = new Error().stack);
    }
    setParent(e, t) {
      let n = this.getDisposableData(e);
      n.parent = t;
    }
    markAsDisposed(e) {
      this.livingDisposables.delete(e);
    }
    markAsSingleton(e) {
      this.getDisposableData(e).isSingleton = true;
    }
    getRootParent(e, t) {
      let n = t.get(e);
      if (n) return n;
      let s = e.parent ? this.getRootParent(this.getDisposableData(e.parent), t) : e;
      return t.set(e, s), s;
    }
    getTrackedDisposables() {
      let e = /* @__PURE__ */ new Map();
      return [...this.livingDisposables.entries()].filter(([, n]) => n.source !== null && !this.getRootParent(n, e).isSingleton).flatMap(([n]) => n);
    }
    computeLeakingDisposables(e = 10, t) {
      let n;
      if (t) n = t;
      else {
        let l2 = /* @__PURE__ */ new Map(), u = [...this.livingDisposables.values()].filter((d) => d.source !== null && !this.getRootParent(d, l2).isSingleton);
        if (u.length === 0) return;
        let c = new Set(u.map((d) => d.value));
        if (n = u.filter((d) => !(d.parent && c.has(d.parent))), n.length === 0) throw new Error("There are cyclic diposable chains!");
      }
      if (!n) return;
      function s(l2) {
        function u(d, h2) {
          for (; d.length > 0 && h2.some((f) => typeof f == "string" ? f === d[0] : d[0].match(f)); ) d.shift();
        }
        let c = l2.source.split(`
`).map((d) => d.trim().replace("at ", "")).filter((d) => d !== "");
        return u(c, ["Error", /^trackDisposable \(.*\)$/, /^DisposableTracker.trackDisposable \(.*\)$/]), c.reverse();
      }
      let o2 = new Tt2();
      for (let l2 of n) {
        let u = s(l2);
        for (let c = 0; c <= u.length; c++) o2.add(u.slice(0, c).join(`
`), l2);
      }
      n.sort(tn((l2) => l2.idx, nn));
      let r11 = "", a = 0;
      for (let l2 of n.slice(0, e)) {
        a++;
        let u = s(l2), c = [];
        for (let d = 0; d < u.length; d++) {
          let h2 = u[d];
          h2 = `(shared with ${o2.get(u.slice(0, d + 1).join(`
`)).size}/${n.length} leaks) at ${h2}`;
          let I2 = o2.get(u.slice(0, d).join(`
`)), L2 = an([...I2].map((M6) => s(M6)[d]), (M6) => M6);
          delete L2[u[d]];
          for (let [M6, q3] of Object.entries(L2)) c.unshift(`    - stacktraces of ${q3.length} other leaks continue with ${M6}`);
          c.unshift(h2);
        }
        r11 += `


==================== Leaking disposable ${a}/${n.length}: ${l2.value.constructor.name} ====================
${c.join(`
`)}
============================================================

`;
      }
      return n.length > e && (r11 += `


... and ${n.length - e} more leaking disposables

`), { leaks: n, details: r11 };
    }
  };
  gt2.idx = 0;
  function Sr(i8) {
    Ne3 = i8;
  }
  if (Ar) {
    let i8 = "__is_disposable_tracked__";
    Sr(new class {
      trackDisposable(e) {
        let t = new Error("Potentially leaked disposable").stack;
        setTimeout(() => {
          e[i8] || console.log(t);
        }, 3e3);
      }
      setParent(e, t) {
        if (e && e !== B3.None) try {
          e[i8] = true;
        } catch {
        }
      }
      markAsDisposed(e) {
        if (e && e !== B3.None) try {
          e[i8] = true;
        } catch {
        }
      }
      markAsSingleton(e) {
      }
    }());
  }
  function Et2(i8) {
    return Ne3?.trackDisposable(i8), i8;
  }
  function yt3(i8) {
    Ne3?.markAsDisposed(i8);
  }
  function Qe3(i8, e) {
    Ne3?.setParent(i8, e);
  }
  function Or(i8, e) {
    if (Ne3) for (let t of i8) Ne3.setParent(t, e);
  }
  function un(i8) {
    if (_i.is(i8)) {
      let e = [];
      for (let t of i8) if (t) try {
        t.dispose();
      } catch (n) {
        e.push(n);
      }
      if (e.length === 1) throw e[0];
      if (e.length > 1) throw new AggregateError(e, "Encountered errors while disposing of store");
      return Array.isArray(i8) ? [] : i8;
    } else if (i8) return i8.dispose(), i8;
  }
  function It3(...i8) {
    let e = O3(() => un(i8));
    return Or(i8, e), e;
  }
  function O3(i8) {
    let e = Et2({ dispose: mi(() => {
      yt3(e), i8();
    }) });
    return e;
  }
  var xt3 = class xt4 {
    constructor() {
      this._toDispose = /* @__PURE__ */ new Set();
      this._isDisposed = false;
      Et2(this);
    }
    dispose() {
      this._isDisposed || (yt3(this), this._isDisposed = true, this.clear());
    }
    get isDisposed() {
      return this._isDisposed;
    }
    clear() {
      if (this._toDispose.size !== 0) try {
        un(this._toDispose);
      } finally {
        this._toDispose.clear();
      }
    }
    add(e) {
      if (!e) return e;
      if (e === this) throw new Error("Cannot register a disposable on itself!");
      return Qe3(e, this), this._isDisposed ? xt4.DISABLE_DISPOSED_WARNING || console.warn(new Error("Trying to add a disposable to a DisposableStore that has already been disposed of. The added object will be leaked!").stack) : this._toDispose.add(e), e;
    }
    delete(e) {
      if (e) {
        if (e === this) throw new Error("Cannot dispose a disposable on itself!");
        this._toDispose.delete(e), e.dispose();
      }
    }
    deleteAndLeak(e) {
      e && this._toDispose.has(e) && (this._toDispose.delete(e), Qe3(e, null));
    }
  };
  xt3.DISABLE_DISPOSED_WARNING = false;
  var fe4 = xt3;
  var B3 = class {
    constructor() {
      this._store = new fe4();
      Et2(this), Qe3(this._store, this);
    }
    dispose() {
      yt3(this), this._store.dispose();
    }
    _register(e) {
      if (e === this) throw new Error("Cannot register a disposable on itself!");
      return this._store.add(e);
    }
  };
  B3.None = Object.freeze({ dispose() {
  } });
  var be5 = class {
    constructor() {
      this._isDisposed = false;
      Et2(this);
    }
    get value() {
      return this._isDisposed ? void 0 : this._value;
    }
    set value(e) {
      this._isDisposed || e === this._value || (this._value?.dispose(), e && Qe3(e, this), this._value = e);
    }
    clear() {
      this.value = void 0;
    }
    dispose() {
      this._isDisposed = true, yt3(this), this._value?.dispose(), this._value = void 0;
    }
    clearAndLeak() {
      let e = this._value;
      return this._value = void 0, e && Qe3(e, null), e;
    }
  };
  var Lt2 = typeof process < "u" && "title" in process;
  var Ze2 = Lt2 ? "node" : navigator.userAgent;
  var bi = Lt2 ? "node" : navigator.platform;
  var cn = Ze2.includes("Firefox");
  var dn = Ze2.includes("Edge");
  var vi = /^((?!chrome|android).)*safari/i.test(Ze2);
  function hn() {
    if (!vi) return 0;
    let i8 = Ze2.match(/Version\/(\d+)/);
    return i8 === null || i8.length < 2 ? 0 : parseInt(i8[1]);
  }
  var oo = ["Macintosh", "MacIntel", "MacPPC", "Mac68K"].includes(bi);
  var ao = ["Windows", "Win16", "Win32", "WinCE"].includes(bi);
  var lo = bi.indexOf("Linux") >= 0;
  var uo = /\bCrOS\b/.test(Ze2);
  var pn = "";
  var K3 = 0;
  var V4 = 0;
  var C3 = 0;
  var U2 = 0;
  var Z4 = { css: "#00000000", rgba: 0 };
  var X5;
  ((n) => {
    function i8(s, o2, r11, a) {
      return a !== void 0 ? `#${Oe4(s)}${Oe4(o2)}${Oe4(r11)}${Oe4(a)}` : `#${Oe4(s)}${Oe4(o2)}${Oe4(r11)}`;
    }
    n.toCss = i8;
    function e(s, o2, r11, a = 255) {
      return (s << 24 | o2 << 16 | r11 << 8 | a) >>> 0;
    }
    n.toRgba = e;
    function t(s, o2, r11, a) {
      return { css: n.toCss(s, o2, r11, a), rgba: n.toRgba(s, o2, r11, a) };
    }
    n.toColor = t;
  })(X5 || (X5 = {}));
  var Ue3;
  ((a) => {
    function i8(l2, u) {
      if (U2 = (u.rgba & 255) / 255, U2 === 1) return { css: u.css, rgba: u.rgba };
      let c = u.rgba >> 24 & 255, d = u.rgba >> 16 & 255, h2 = u.rgba >> 8 & 255, f = l2.rgba >> 24 & 255, I2 = l2.rgba >> 16 & 255, L2 = l2.rgba >> 8 & 255;
      K3 = f + Math.round((c - f) * U2), V4 = I2 + Math.round((d - I2) * U2), C3 = L2 + Math.round((h2 - L2) * U2);
      let M6 = X5.toCss(K3, V4, C3), q3 = X5.toRgba(K3, V4, C3);
      return { css: M6, rgba: q3 };
    }
    a.blend = i8;
    function e(l2) {
      return (l2.rgba & 255) === 255;
    }
    a.isOpaque = e;
    function t(l2, u, c) {
      let d = Te3.ensureContrastRatio(l2.rgba, u.rgba, c);
      if (d) return X5.toColor(d >> 24 & 255, d >> 16 & 255, d >> 8 & 255);
    }
    a.ensureContrastRatio = t;
    function n(l2) {
      let u = (l2.rgba | 255) >>> 0;
      return [K3, V4, C3] = Te3.toChannels(u), { css: X5.toCss(K3, V4, C3), rgba: u };
    }
    a.opaque = n;
    function s(l2, u) {
      return U2 = Math.round(u * 255), [K3, V4, C3] = Te3.toChannels(l2.rgba), { css: X5.toCss(K3, V4, C3, U2), rgba: X5.toRgba(K3, V4, C3, U2) };
    }
    a.opacity = s;
    function o2(l2, u) {
      return U2 = l2.rgba & 255, s(l2, U2 * u / 255);
    }
    a.multiplyOpacity = o2;
    function r11(l2) {
      return [l2.rgba >> 24 & 255, l2.rgba >> 16 & 255, l2.rgba >> 8 & 255];
    }
    a.toColorRGB = r11;
  })(Ue3 || (Ue3 = {}));
  var Fr;
  ((n) => {
    let i8, e;
    try {
      let s = document.createElement("canvas");
      s.width = 1, s.height = 1;
      let o2 = s.getContext("2d", { willReadFrequently: true });
      o2 && (i8 = o2, i8.globalCompositeOperation = "copy", e = i8.createLinearGradient(0, 0, 1, 1));
    } catch {
    }
    function t(s) {
      if (s.match(/#[\da-f]{3,8}/i)) switch (s.length) {
        case 4:
          return K3 = parseInt(s.slice(1, 2).repeat(2), 16), V4 = parseInt(s.slice(2, 3).repeat(2), 16), C3 = parseInt(s.slice(3, 4).repeat(2), 16), X5.toColor(K3, V4, C3);
        case 5:
          return K3 = parseInt(s.slice(1, 2).repeat(2), 16), V4 = parseInt(s.slice(2, 3).repeat(2), 16), C3 = parseInt(s.slice(3, 4).repeat(2), 16), U2 = parseInt(s.slice(4, 5).repeat(2), 16), X5.toColor(K3, V4, C3, U2);
        case 7:
          return { css: s, rgba: (parseInt(s.slice(1), 16) << 8 | 255) >>> 0 };
        case 9:
          return { css: s, rgba: parseInt(s.slice(1), 16) >>> 0 };
      }
      let o2 = s.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(,\s*(0|1|\d?\.(\d+))\s*)?\)/);
      if (o2) return K3 = parseInt(o2[1]), V4 = parseInt(o2[2]), C3 = parseInt(o2[3]), U2 = Math.round((o2[5] === void 0 ? 1 : parseFloat(o2[5])) * 255), X5.toColor(K3, V4, C3, U2);
      if (!i8 || !e) throw new Error("css.toColor: Unsupported css format");
      if (i8.fillStyle = e, i8.fillStyle = s, typeof i8.fillStyle != "string") throw new Error("css.toColor: Unsupported css format");
      if (i8.fillRect(0, 0, 1, 1), [K3, V4, C3, U2] = i8.getImageData(0, 0, 1, 1).data, U2 !== 255) throw new Error("css.toColor: Unsupported css format");
      return { rgba: X5.toRgba(K3, V4, C3, U2), css: s };
    }
    n.toColor = t;
  })(Fr || (Fr = {}));
  var Y4;
  ((t) => {
    function i8(n) {
      return e(n >> 16 & 255, n >> 8 & 255, n & 255);
    }
    t.relativeLuminance = i8;
    function e(n, s, o2) {
      let r11 = n / 255, a = s / 255, l2 = o2 / 255, u = r11 <= 0.03928 ? r11 / 12.92 : Math.pow((r11 + 0.055) / 1.055, 2.4), c = a <= 0.03928 ? a / 12.92 : Math.pow((a + 0.055) / 1.055, 2.4), d = l2 <= 0.03928 ? l2 / 12.92 : Math.pow((l2 + 0.055) / 1.055, 2.4);
      return u * 0.2126 + c * 0.7152 + d * 0.0722;
    }
    t.relativeLuminance2 = e;
  })(Y4 || (Y4 = {}));
  var Te3;
  ((o2) => {
    function i8(r11, a) {
      if (U2 = (a & 255) / 255, U2 === 1) return a;
      let l2 = a >> 24 & 255, u = a >> 16 & 255, c = a >> 8 & 255, d = r11 >> 24 & 255, h2 = r11 >> 16 & 255, f = r11 >> 8 & 255;
      return K3 = d + Math.round((l2 - d) * U2), V4 = h2 + Math.round((u - h2) * U2), C3 = f + Math.round((c - f) * U2), X5.toRgba(K3, V4, C3);
    }
    o2.blend = i8;
    function e(r11, a, l2) {
      let u = Y4.relativeLuminance(r11 >> 8), c = Y4.relativeLuminance(a >> 8);
      if (ve3(u, c) < l2) {
        if (c < u) {
          let I2 = t(r11, a, l2), L2 = ve3(u, Y4.relativeLuminance(I2 >> 8));
          if (L2 < l2) {
            let M6 = n(r11, a, l2), q3 = ve3(u, Y4.relativeLuminance(M6 >> 8));
            return L2 > q3 ? I2 : M6;
          }
          return I2;
        }
        let h2 = n(r11, a, l2), f = ve3(u, Y4.relativeLuminance(h2 >> 8));
        if (f < l2) {
          let I2 = t(r11, a, l2), L2 = ve3(u, Y4.relativeLuminance(I2 >> 8));
          return f > L2 ? h2 : I2;
        }
        return h2;
      }
    }
    o2.ensureContrastRatio = e;
    function t(r11, a, l2) {
      let u = r11 >> 24 & 255, c = r11 >> 16 & 255, d = r11 >> 8 & 255, h2 = a >> 24 & 255, f = a >> 16 & 255, I2 = a >> 8 & 255, L2 = ve3(Y4.relativeLuminance2(h2, f, I2), Y4.relativeLuminance2(u, c, d));
      for (; L2 < l2 && (h2 > 0 || f > 0 || I2 > 0); ) h2 -= Math.max(0, Math.ceil(h2 * 0.1)), f -= Math.max(0, Math.ceil(f * 0.1)), I2 -= Math.max(0, Math.ceil(I2 * 0.1)), L2 = ve3(Y4.relativeLuminance2(h2, f, I2), Y4.relativeLuminance2(u, c, d));
      return (h2 << 24 | f << 16 | I2 << 8 | 255) >>> 0;
    }
    o2.reduceLuminance = t;
    function n(r11, a, l2) {
      let u = r11 >> 24 & 255, c = r11 >> 16 & 255, d = r11 >> 8 & 255, h2 = a >> 24 & 255, f = a >> 16 & 255, I2 = a >> 8 & 255, L2 = ve3(Y4.relativeLuminance2(h2, f, I2), Y4.relativeLuminance2(u, c, d));
      for (; L2 < l2 && (h2 < 255 || f < 255 || I2 < 255); ) h2 = Math.min(255, h2 + Math.ceil((255 - h2) * 0.1)), f = Math.min(255, f + Math.ceil((255 - f) * 0.1)), I2 = Math.min(255, I2 + Math.ceil((255 - I2) * 0.1)), L2 = ve3(Y4.relativeLuminance2(h2, f, I2), Y4.relativeLuminance2(u, c, d));
      return (h2 << 24 | f << 16 | I2 << 8 | 255) >>> 0;
    }
    o2.increaseLuminance = n;
    function s(r11) {
      return [r11 >> 24 & 255, r11 >> 16 & 255, r11 >> 8 & 255, r11 & 255];
    }
    o2.toChannels = s;
  })(Te3 || (Te3 = {}));
  function Oe4(i8) {
    let e = i8.toString(16);
    return e.length < 2 ? "0" + e : e;
  }
  function ve3(i8, e) {
    return i8 < e ? (e + 0.05) / (i8 + 0.05) : (i8 + 0.05) / (e + 0.05);
  }
  function F3(i8) {
    if (!i8) throw new Error("value must not be falsy");
    return i8;
  }
  function Rt2(i8) {
    return 57508 <= i8 && i8 <= 57558;
  }
  function fn(i8) {
    return 57520 <= i8 && i8 <= 57527;
  }
  function kr(i8) {
    return 57344 <= i8 && i8 <= 63743;
  }
  function Pr(i8) {
    return 9472 <= i8 && i8 <= 9631;
  }
  function Br(i8) {
    return i8 >= 128512 && i8 <= 128591 || i8 >= 127744 && i8 <= 128511 || i8 >= 128640 && i8 <= 128767 || i8 >= 9728 && i8 <= 9983 || i8 >= 9984 && i8 <= 10175 || i8 >= 65024 && i8 <= 65039 || i8 >= 129280 && i8 <= 129535 || i8 >= 127462 && i8 <= 127487;
  }
  function mn(i8, e, t, n) {
    return e === 1 && t > Math.ceil(n * 1.5) && i8 !== void 0 && i8 > 255 && !Br(i8) && !Rt2(i8) && !kr(i8);
  }
  function Dt2(i8) {
    return Rt2(i8) || Pr(i8);
  }
  function _n() {
    return { css: { canvas: wt2(), cell: wt2() }, device: { canvas: wt2(), cell: wt2(), char: { width: 0, height: 0, left: 0, top: 0 } } };
  }
  function wt2() {
    return { width: 0, height: 0 };
  }
  function bn(i8, e, t = 0) {
    return (i8 - (Math.round(e) * 2 - t)) % (Math.round(e) * 2);
  }
  var j3 = 0;
  var z2 = 0;
  var me3 = false;
  var ge4 = false;
  var Mt2 = false;
  var J3;
  var Ti = 0;
  var At3 = class {
    constructor(e, t, n, s, o2, r11) {
      this._terminal = e;
      this._optionService = t;
      this._selectionRenderModel = n;
      this._decorationService = s;
      this._coreBrowserService = o2;
      this._themeService = r11;
      this.result = { fg: 0, bg: 0, ext: 0 };
    }
    resolve(e, t, n, s) {
      if (this.result.bg = e.bg, this.result.fg = e.fg, this.result.ext = e.bg & 268435456 ? e.extended.ext : 0, z2 = 0, j3 = 0, ge4 = false, me3 = false, Mt2 = false, J3 = this._themeService.colors, Ti = 0, e.getCode() !== 0 && e.extended.underlineStyle === 4) {
        let r11 = Math.max(1, Math.floor(this._optionService.rawOptions.fontSize * this._coreBrowserService.dpr / 15));
        Ti = t * s % (Math.round(r11) * 2);
      }
      if (this._decorationService.forEachDecorationAtCell(t, n, "bottom", (r11) => {
        r11.backgroundColorRGB && (z2 = r11.backgroundColorRGB.rgba >> 8 & 16777215, ge4 = true), r11.foregroundColorRGB && (j3 = r11.foregroundColorRGB.rgba >> 8 & 16777215, me3 = true);
      }), Mt2 = this._selectionRenderModel.isCellSelected(this._terminal, t, n), Mt2) {
        if (this.result.fg & 67108864 || (this.result.bg & 50331648) !== 0) {
          if (this.result.fg & 67108864) switch (this.result.fg & 50331648) {
            case 16777216:
            case 33554432:
              z2 = this._themeService.colors.ansi[this.result.fg & 255].rgba;
              break;
            case 50331648:
              z2 = (this.result.fg & 16777215) << 8 | 255;
              break;
            case 0:
            default:
              z2 = this._themeService.colors.foreground.rgba;
          }
          else switch (this.result.bg & 50331648) {
            case 16777216:
            case 33554432:
              z2 = this._themeService.colors.ansi[this.result.bg & 255].rgba;
              break;
            case 50331648:
              z2 = (this.result.bg & 16777215) << 8 | 255;
              break;
          }
          z2 = Te3.blend(z2, (this._coreBrowserService.isFocused ? J3.selectionBackgroundOpaque : J3.selectionInactiveBackgroundOpaque).rgba & 4294967040 | 128) >> 8 & 16777215;
        } else z2 = (this._coreBrowserService.isFocused ? J3.selectionBackgroundOpaque : J3.selectionInactiveBackgroundOpaque).rgba >> 8 & 16777215;
        if (ge4 = true, J3.selectionForeground && (j3 = J3.selectionForeground.rgba >> 8 & 16777215, me3 = true), Dt2(e.getCode())) {
          if (this.result.fg & 67108864 && (this.result.bg & 50331648) === 0) j3 = (this._coreBrowserService.isFocused ? J3.selectionBackgroundOpaque : J3.selectionInactiveBackgroundOpaque).rgba >> 8 & 16777215;
          else {
            if (this.result.fg & 67108864) switch (this.result.bg & 50331648) {
              case 16777216:
              case 33554432:
                j3 = this._themeService.colors.ansi[this.result.bg & 255].rgba;
                break;
              case 50331648:
                j3 = (this.result.bg & 16777215) << 8 | 255;
                break;
            }
            else switch (this.result.fg & 50331648) {
              case 16777216:
              case 33554432:
                j3 = this._themeService.colors.ansi[this.result.fg & 255].rgba;
                break;
              case 50331648:
                j3 = (this.result.fg & 16777215) << 8 | 255;
                break;
              case 0:
              default:
                j3 = this._themeService.colors.foreground.rgba;
            }
            j3 = Te3.blend(j3, (this._coreBrowserService.isFocused ? J3.selectionBackgroundOpaque : J3.selectionInactiveBackgroundOpaque).rgba & 4294967040 | 128) >> 8 & 16777215;
          }
          me3 = true;
        }
      }
      this._decorationService.forEachDecorationAtCell(t, n, "top", (r11) => {
        r11.backgroundColorRGB && (z2 = r11.backgroundColorRGB.rgba >> 8 & 16777215, ge4 = true), r11.foregroundColorRGB && (j3 = r11.foregroundColorRGB.rgba >> 8 & 16777215, me3 = true);
      }), ge4 && (Mt2 ? z2 = e.bg & -16777216 & -134217729 | z2 | 50331648 : z2 = e.bg & -16777216 | z2 | 50331648), me3 && (j3 = e.fg & -16777216 & -67108865 | j3 | 50331648), this.result.fg & 67108864 && (ge4 && !me3 && ((this.result.bg & 50331648) === 0 ? j3 = this.result.fg & -134217728 | J3.background.rgba >> 8 & 16777215 & 16777215 | 50331648 : j3 = this.result.fg & -134217728 | this.result.bg & 67108863, me3 = true), !ge4 && me3 && ((this.result.fg & 50331648) === 0 ? z2 = this.result.bg & -67108864 | J3.foreground.rgba >> 8 & 16777215 & 16777215 | 50331648 : z2 = this.result.bg & -67108864 | this.result.fg & 67108863, ge4 = true)), J3 = void 0, this.result.bg = ge4 ? z2 : this.result.bg, this.result.fg = me3 ? j3 : this.result.fg, this.result.ext &= 536870911, this.result.ext |= Ti << 29 & 3758096384;
    }
  };
  var gn2 = 0.5;
  var St3 = cn || dn ? "bottom" : "ideographic";
  var Hr = { "\u2580": [{ x: 0, y: 0, w: 8, h: 4 }], "\u2581": [{ x: 0, y: 7, w: 8, h: 1 }], "\u2582": [{ x: 0, y: 6, w: 8, h: 2 }], "\u2583": [{ x: 0, y: 5, w: 8, h: 3 }], "\u2584": [{ x: 0, y: 4, w: 8, h: 4 }], "\u2585": [{ x: 0, y: 3, w: 8, h: 5 }], "\u2586": [{ x: 0, y: 2, w: 8, h: 6 }], "\u2587": [{ x: 0, y: 1, w: 8, h: 7 }], "\u2588": [{ x: 0, y: 0, w: 8, h: 8 }], "\u2589": [{ x: 0, y: 0, w: 7, h: 8 }], "\u258A": [{ x: 0, y: 0, w: 6, h: 8 }], "\u258B": [{ x: 0, y: 0, w: 5, h: 8 }], "\u258C": [{ x: 0, y: 0, w: 4, h: 8 }], "\u258D": [{ x: 0, y: 0, w: 3, h: 8 }], "\u258E": [{ x: 0, y: 0, w: 2, h: 8 }], "\u258F": [{ x: 0, y: 0, w: 1, h: 8 }], "\u2590": [{ x: 4, y: 0, w: 4, h: 8 }], "\u2594": [{ x: 0, y: 0, w: 8, h: 1 }], "\u2595": [{ x: 7, y: 0, w: 1, h: 8 }], "\u2596": [{ x: 0, y: 4, w: 4, h: 4 }], "\u2597": [{ x: 4, y: 4, w: 4, h: 4 }], "\u2598": [{ x: 0, y: 0, w: 4, h: 4 }], "\u2599": [{ x: 0, y: 0, w: 4, h: 8 }, { x: 0, y: 4, w: 8, h: 4 }], "\u259A": [{ x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 4, w: 4, h: 4 }], "\u259B": [{ x: 0, y: 0, w: 4, h: 8 }, { x: 4, y: 0, w: 4, h: 4 }], "\u259C": [{ x: 0, y: 0, w: 8, h: 4 }, { x: 4, y: 0, w: 4, h: 8 }], "\u259D": [{ x: 4, y: 0, w: 4, h: 4 }], "\u259E": [{ x: 4, y: 0, w: 4, h: 4 }, { x: 0, y: 4, w: 4, h: 4 }], "\u259F": [{ x: 4, y: 0, w: 4, h: 8 }, { x: 0, y: 4, w: 8, h: 4 }], "\u{1FB70}": [{ x: 1, y: 0, w: 1, h: 8 }], "\u{1FB71}": [{ x: 2, y: 0, w: 1, h: 8 }], "\u{1FB72}": [{ x: 3, y: 0, w: 1, h: 8 }], "\u{1FB73}": [{ x: 4, y: 0, w: 1, h: 8 }], "\u{1FB74}": [{ x: 5, y: 0, w: 1, h: 8 }], "\u{1FB75}": [{ x: 6, y: 0, w: 1, h: 8 }], "\u{1FB76}": [{ x: 0, y: 1, w: 8, h: 1 }], "\u{1FB77}": [{ x: 0, y: 2, w: 8, h: 1 }], "\u{1FB78}": [{ x: 0, y: 3, w: 8, h: 1 }], "\u{1FB79}": [{ x: 0, y: 4, w: 8, h: 1 }], "\u{1FB7A}": [{ x: 0, y: 5, w: 8, h: 1 }], "\u{1FB7B}": [{ x: 0, y: 6, w: 8, h: 1 }], "\u{1FB7C}": [{ x: 0, y: 0, w: 1, h: 8 }, { x: 0, y: 7, w: 8, h: 1 }], "\u{1FB7D}": [{ x: 0, y: 0, w: 1, h: 8 }, { x: 0, y: 0, w: 8, h: 1 }], "\u{1FB7E}": [{ x: 7, y: 0, w: 1, h: 8 }, { x: 0, y: 0, w: 8, h: 1 }], "\u{1FB7F}": [{ x: 7, y: 0, w: 1, h: 8 }, { x: 0, y: 7, w: 8, h: 1 }], "\u{1FB80}": [{ x: 0, y: 0, w: 8, h: 1 }, { x: 0, y: 7, w: 8, h: 1 }], "\u{1FB81}": [{ x: 0, y: 0, w: 8, h: 1 }, { x: 0, y: 2, w: 8, h: 1 }, { x: 0, y: 4, w: 8, h: 1 }, { x: 0, y: 7, w: 8, h: 1 }], "\u{1FB82}": [{ x: 0, y: 0, w: 8, h: 2 }], "\u{1FB83}": [{ x: 0, y: 0, w: 8, h: 3 }], "\u{1FB84}": [{ x: 0, y: 0, w: 8, h: 5 }], "\u{1FB85}": [{ x: 0, y: 0, w: 8, h: 6 }], "\u{1FB86}": [{ x: 0, y: 0, w: 8, h: 7 }], "\u{1FB87}": [{ x: 6, y: 0, w: 2, h: 8 }], "\u{1FB88}": [{ x: 5, y: 0, w: 3, h: 8 }], "\u{1FB89}": [{ x: 3, y: 0, w: 5, h: 8 }], "\u{1FB8A}": [{ x: 2, y: 0, w: 6, h: 8 }], "\u{1FB8B}": [{ x: 1, y: 0, w: 7, h: 8 }], "\u{1FB95}": [{ x: 0, y: 0, w: 2, h: 2 }, { x: 4, y: 0, w: 2, h: 2 }, { x: 2, y: 2, w: 2, h: 2 }, { x: 6, y: 2, w: 2, h: 2 }, { x: 0, y: 4, w: 2, h: 2 }, { x: 4, y: 4, w: 2, h: 2 }, { x: 2, y: 6, w: 2, h: 2 }, { x: 6, y: 6, w: 2, h: 2 }], "\u{1FB96}": [{ x: 2, y: 0, w: 2, h: 2 }, { x: 6, y: 0, w: 2, h: 2 }, { x: 0, y: 2, w: 2, h: 2 }, { x: 4, y: 2, w: 2, h: 2 }, { x: 2, y: 4, w: 2, h: 2 }, { x: 6, y: 4, w: 2, h: 2 }, { x: 0, y: 6, w: 2, h: 2 }, { x: 4, y: 6, w: 2, h: 2 }], "\u{1FB97}": [{ x: 0, y: 2, w: 8, h: 2 }, { x: 0, y: 6, w: 8, h: 2 }] };
  var Wr = { "\u2591": [[1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 0]], "\u2592": [[1, 0], [0, 0], [0, 1], [0, 0]], "\u2593": [[0, 1], [1, 1], [1, 0], [1, 1]] };
  var Gr = { "\u2500": { 1: "M0,.5 L1,.5" }, "\u2501": { 3: "M0,.5 L1,.5" }, "\u2502": { 1: "M.5,0 L.5,1" }, "\u2503": { 3: "M.5,0 L.5,1" }, "\u250C": { 1: "M0.5,1 L.5,.5 L1,.5" }, "\u250F": { 3: "M0.5,1 L.5,.5 L1,.5" }, "\u2510": { 1: "M0,.5 L.5,.5 L.5,1" }, "\u2513": { 3: "M0,.5 L.5,.5 L.5,1" }, "\u2514": { 1: "M.5,0 L.5,.5 L1,.5" }, "\u2517": { 3: "M.5,0 L.5,.5 L1,.5" }, "\u2518": { 1: "M.5,0 L.5,.5 L0,.5" }, "\u251B": { 3: "M.5,0 L.5,.5 L0,.5" }, "\u251C": { 1: "M.5,0 L.5,1 M.5,.5 L1,.5" }, "\u2523": { 3: "M.5,0 L.5,1 M.5,.5 L1,.5" }, "\u2524": { 1: "M.5,0 L.5,1 M.5,.5 L0,.5" }, "\u252B": { 3: "M.5,0 L.5,1 M.5,.5 L0,.5" }, "\u252C": { 1: "M0,.5 L1,.5 M.5,.5 L.5,1" }, "\u2533": { 3: "M0,.5 L1,.5 M.5,.5 L.5,1" }, "\u2534": { 1: "M0,.5 L1,.5 M.5,.5 L.5,0" }, "\u253B": { 3: "M0,.5 L1,.5 M.5,.5 L.5,0" }, "\u253C": { 1: "M0,.5 L1,.5 M.5,0 L.5,1" }, "\u254B": { 3: "M0,.5 L1,.5 M.5,0 L.5,1" }, "\u2574": { 1: "M.5,.5 L0,.5" }, "\u2578": { 3: "M.5,.5 L0,.5" }, "\u2575": { 1: "M.5,.5 L.5,0" }, "\u2579": { 3: "M.5,.5 L.5,0" }, "\u2576": { 1: "M.5,.5 L1,.5" }, "\u257A": { 3: "M.5,.5 L1,.5" }, "\u2577": { 1: "M.5,.5 L.5,1" }, "\u257B": { 3: "M.5,.5 L.5,1" }, "\u2550": { 1: (i8, e) => `M0,${0.5 - e} L1,${0.5 - e} M0,${0.5 + e} L1,${0.5 + e}` }, "\u2551": { 1: (i8, e) => `M${0.5 - i8},0 L${0.5 - i8},1 M${0.5 + i8},0 L${0.5 + i8},1` }, "\u2552": { 1: (i8, e) => `M.5,1 L.5,${0.5 - e} L1,${0.5 - e} M.5,${0.5 + e} L1,${0.5 + e}` }, "\u2553": { 1: (i8, e) => `M${0.5 - i8},1 L${0.5 - i8},.5 L1,.5 M${0.5 + i8},.5 L${0.5 + i8},1` }, "\u2554": { 1: (i8, e) => `M1,${0.5 - e} L${0.5 - i8},${0.5 - e} L${0.5 - i8},1 M1,${0.5 + e} L${0.5 + i8},${0.5 + e} L${0.5 + i8},1` }, "\u2555": { 1: (i8, e) => `M0,${0.5 - e} L.5,${0.5 - e} L.5,1 M0,${0.5 + e} L.5,${0.5 + e}` }, "\u2556": { 1: (i8, e) => `M${0.5 + i8},1 L${0.5 + i8},.5 L0,.5 M${0.5 - i8},.5 L${0.5 - i8},1` }, "\u2557": { 1: (i8, e) => `M0,${0.5 + e} L${0.5 - i8},${0.5 + e} L${0.5 - i8},1 M0,${0.5 - e} L${0.5 + i8},${0.5 - e} L${0.5 + i8},1` }, "\u2558": { 1: (i8, e) => `M.5,0 L.5,${0.5 + e} L1,${0.5 + e} M.5,${0.5 - e} L1,${0.5 - e}` }, "\u2559": { 1: (i8, e) => `M1,.5 L${0.5 - i8},.5 L${0.5 - i8},0 M${0.5 + i8},.5 L${0.5 + i8},0` }, "\u255A": { 1: (i8, e) => `M1,${0.5 - e} L${0.5 + i8},${0.5 - e} L${0.5 + i8},0 M1,${0.5 + e} L${0.5 - i8},${0.5 + e} L${0.5 - i8},0` }, "\u255B": { 1: (i8, e) => `M0,${0.5 + e} L.5,${0.5 + e} L.5,0 M0,${0.5 - e} L.5,${0.5 - e}` }, "\u255C": { 1: (i8, e) => `M0,.5 L${0.5 + i8},.5 L${0.5 + i8},0 M${0.5 - i8},.5 L${0.5 - i8},0` }, "\u255D": { 1: (i8, e) => `M0,${0.5 - e} L${0.5 - i8},${0.5 - e} L${0.5 - i8},0 M0,${0.5 + e} L${0.5 + i8},${0.5 + e} L${0.5 + i8},0` }, "\u255E": { 1: (i8, e) => `M.5,0 L.5,1 M.5,${0.5 - e} L1,${0.5 - e} M.5,${0.5 + e} L1,${0.5 + e}` }, "\u255F": { 1: (i8, e) => `M${0.5 - i8},0 L${0.5 - i8},1 M${0.5 + i8},0 L${0.5 + i8},1 M${0.5 + i8},.5 L1,.5` }, "\u2560": { 1: (i8, e) => `M${0.5 - i8},0 L${0.5 - i8},1 M1,${0.5 + e} L${0.5 + i8},${0.5 + e} L${0.5 + i8},1 M1,${0.5 - e} L${0.5 + i8},${0.5 - e} L${0.5 + i8},0` }, "\u2561": { 1: (i8, e) => `M.5,0 L.5,1 M0,${0.5 - e} L.5,${0.5 - e} M0,${0.5 + e} L.5,${0.5 + e}` }, "\u2562": { 1: (i8, e) => `M0,.5 L${0.5 - i8},.5 M${0.5 - i8},0 L${0.5 - i8},1 M${0.5 + i8},0 L${0.5 + i8},1` }, "\u2563": { 1: (i8, e) => `M${0.5 + i8},0 L${0.5 + i8},1 M0,${0.5 + e} L${0.5 - i8},${0.5 + e} L${0.5 - i8},1 M0,${0.5 - e} L${0.5 - i8},${0.5 - e} L${0.5 - i8},0` }, "\u2564": { 1: (i8, e) => `M0,${0.5 - e} L1,${0.5 - e} M0,${0.5 + e} L1,${0.5 + e} M.5,${0.5 + e} L.5,1` }, "\u2565": { 1: (i8, e) => `M0,.5 L1,.5 M${0.5 - i8},.5 L${0.5 - i8},1 M${0.5 + i8},.5 L${0.5 + i8},1` }, "\u2566": { 1: (i8, e) => `M0,${0.5 - e} L1,${0.5 - e} M0,${0.5 + e} L${0.5 - i8},${0.5 + e} L${0.5 - i8},1 M1,${0.5 + e} L${0.5 + i8},${0.5 + e} L${0.5 + i8},1` }, "\u2567": { 1: (i8, e) => `M.5,0 L.5,${0.5 - e} M0,${0.5 - e} L1,${0.5 - e} M0,${0.5 + e} L1,${0.5 + e}` }, "\u2568": { 1: (i8, e) => `M0,.5 L1,.5 M${0.5 - i8},.5 L${0.5 - i8},0 M${0.5 + i8},.5 L${0.5 + i8},0` }, "\u2569": { 1: (i8, e) => `M0,${0.5 + e} L1,${0.5 + e} M0,${0.5 - e} L${0.5 - i8},${0.5 - e} L${0.5 - i8},0 M1,${0.5 - e} L${0.5 + i8},${0.5 - e} L${0.5 + i8},0` }, "\u256A": { 1: (i8, e) => `M.5,0 L.5,1 M0,${0.5 - e} L1,${0.5 - e} M0,${0.5 + e} L1,${0.5 + e}` }, "\u256B": { 1: (i8, e) => `M0,.5 L1,.5 M${0.5 - i8},0 L${0.5 - i8},1 M${0.5 + i8},0 L${0.5 + i8},1` }, "\u256C": { 1: (i8, e) => `M0,${0.5 + e} L${0.5 - i8},${0.5 + e} L${0.5 - i8},1 M1,${0.5 + e} L${0.5 + i8},${0.5 + e} L${0.5 + i8},1 M0,${0.5 - e} L${0.5 - i8},${0.5 - e} L${0.5 - i8},0 M1,${0.5 - e} L${0.5 + i8},${0.5 - e} L${0.5 + i8},0` }, "\u2571": { 1: "M1,0 L0,1" }, "\u2572": { 1: "M0,0 L1,1" }, "\u2573": { 1: "M1,0 L0,1 M0,0 L1,1" }, "\u257C": { 1: "M.5,.5 L0,.5", 3: "M.5,.5 L1,.5" }, "\u257D": { 1: "M.5,.5 L.5,0", 3: "M.5,.5 L.5,1" }, "\u257E": { 1: "M.5,.5 L1,.5", 3: "M.5,.5 L0,.5" }, "\u257F": { 1: "M.5,.5 L.5,1", 3: "M.5,.5 L.5,0" }, "\u250D": { 1: "M.5,.5 L.5,1", 3: "M.5,.5 L1,.5" }, "\u250E": { 1: "M.5,.5 L1,.5", 3: "M.5,.5 L.5,1" }, "\u2511": { 1: "M.5,.5 L.5,1", 3: "M.5,.5 L0,.5" }, "\u2512": { 1: "M.5,.5 L0,.5", 3: "M.5,.5 L.5,1" }, "\u2515": { 1: "M.5,.5 L.5,0", 3: "M.5,.5 L1,.5" }, "\u2516": { 1: "M.5,.5 L1,.5", 3: "M.5,.5 L.5,0" }, "\u2519": { 1: "M.5,.5 L.5,0", 3: "M.5,.5 L0,.5" }, "\u251A": { 1: "M.5,.5 L0,.5", 3: "M.5,.5 L.5,0" }, "\u251D": { 1: "M.5,0 L.5,1", 3: "M.5,.5 L1,.5" }, "\u251E": { 1: "M0.5,1 L.5,.5 L1,.5", 3: "M.5,.5 L.5,0" }, "\u251F": { 1: "M.5,0 L.5,.5 L1,.5", 3: "M.5,.5 L.5,1" }, "\u2520": { 1: "M.5,.5 L1,.5", 3: "M.5,0 L.5,1" }, "\u2521": { 1: "M.5,.5 L.5,1", 3: "M.5,0 L.5,.5 L1,.5" }, "\u2522": { 1: "M.5,.5 L.5,0", 3: "M0.5,1 L.5,.5 L1,.5" }, "\u2525": { 1: "M.5,0 L.5,1", 3: "M.5,.5 L0,.5" }, "\u2526": { 1: "M0,.5 L.5,.5 L.5,1", 3: "M.5,.5 L.5,0" }, "\u2527": { 1: "M.5,0 L.5,.5 L0,.5", 3: "M.5,.5 L.5,1" }, "\u2528": { 1: "M.5,.5 L0,.5", 3: "M.5,0 L.5,1" }, "\u2529": { 1: "M.5,.5 L.5,1", 3: "M.5,0 L.5,.5 L0,.5" }, "\u252A": { 1: "M.5,.5 L.5,0", 3: "M0,.5 L.5,.5 L.5,1" }, "\u252D": { 1: "M0.5,1 L.5,.5 L1,.5", 3: "M.5,.5 L0,.5" }, "\u252E": { 1: "M0,.5 L.5,.5 L.5,1", 3: "M.5,.5 L1,.5" }, "\u252F": { 1: "M.5,.5 L.5,1", 3: "M0,.5 L1,.5" }, "\u2530": { 1: "M0,.5 L1,.5", 3: "M.5,.5 L.5,1" }, "\u2531": { 1: "M.5,.5 L1,.5", 3: "M0,.5 L.5,.5 L.5,1" }, "\u2532": { 1: "M.5,.5 L0,.5", 3: "M0.5,1 L.5,.5 L1,.5" }, "\u2535": { 1: "M.5,0 L.5,.5 L1,.5", 3: "M.5,.5 L0,.5" }, "\u2536": { 1: "M.5,0 L.5,.5 L0,.5", 3: "M.5,.5 L1,.5" }, "\u2537": { 1: "M.5,.5 L.5,0", 3: "M0,.5 L1,.5" }, "\u2538": { 1: "M0,.5 L1,.5", 3: "M.5,.5 L.5,0" }, "\u2539": { 1: "M.5,.5 L1,.5", 3: "M.5,0 L.5,.5 L0,.5" }, "\u253A": { 1: "M.5,.5 L0,.5", 3: "M.5,0 L.5,.5 L1,.5" }, "\u253D": { 1: "M.5,0 L.5,1 M.5,.5 L1,.5", 3: "M.5,.5 L0,.5" }, "\u253E": { 1: "M.5,0 L.5,1 M.5,.5 L0,.5", 3: "M.5,.5 L1,.5" }, "\u253F": { 1: "M.5,0 L.5,1", 3: "M0,.5 L1,.5" }, "\u2540": { 1: "M0,.5 L1,.5 M.5,.5 L.5,1", 3: "M.5,.5 L.5,0" }, "\u2541": { 1: "M.5,.5 L.5,0 M0,.5 L1,.5", 3: "M.5,.5 L.5,1" }, "\u2542": { 1: "M0,.5 L1,.5", 3: "M.5,0 L.5,1" }, "\u2543": { 1: "M0.5,1 L.5,.5 L1,.5", 3: "M.5,0 L.5,.5 L0,.5" }, "\u2544": { 1: "M0,.5 L.5,.5 L.5,1", 3: "M.5,0 L.5,.5 L1,.5" }, "\u2545": { 1: "M.5,0 L.5,.5 L1,.5", 3: "M0,.5 L.5,.5 L.5,1" }, "\u2546": { 1: "M.5,0 L.5,.5 L0,.5", 3: "M0.5,1 L.5,.5 L1,.5" }, "\u2547": { 1: "M.5,.5 L.5,1", 3: "M.5,.5 L.5,0 M0,.5 L1,.5" }, "\u2548": { 1: "M.5,.5 L.5,0", 3: "M0,.5 L1,.5 M.5,.5 L.5,1" }, "\u2549": { 1: "M.5,.5 L1,.5", 3: "M.5,0 L.5,1 M.5,.5 L0,.5" }, "\u254A": { 1: "M.5,.5 L0,.5", 3: "M.5,0 L.5,1 M.5,.5 L1,.5" }, "\u254C": { 1: "M.1,.5 L.4,.5 M.6,.5 L.9,.5" }, "\u254D": { 3: "M.1,.5 L.4,.5 M.6,.5 L.9,.5" }, "\u2504": { 1: "M.0667,.5 L.2667,.5 M.4,.5 L.6,.5 M.7333,.5 L.9333,.5" }, "\u2505": { 3: "M.0667,.5 L.2667,.5 M.4,.5 L.6,.5 M.7333,.5 L.9333,.5" }, "\u2508": { 1: "M.05,.5 L.2,.5 M.3,.5 L.45,.5 M.55,.5 L.7,.5 M.8,.5 L.95,.5" }, "\u2509": { 3: "M.05,.5 L.2,.5 M.3,.5 L.45,.5 M.55,.5 L.7,.5 M.8,.5 L.95,.5" }, "\u254E": { 1: "M.5,.1 L.5,.4 M.5,.6 L.5,.9" }, "\u254F": { 3: "M.5,.1 L.5,.4 M.5,.6 L.5,.9" }, "\u2506": { 1: "M.5,.0667 L.5,.2667 M.5,.4 L.5,.6 M.5,.7333 L.5,.9333" }, "\u2507": { 3: "M.5,.0667 L.5,.2667 M.5,.4 L.5,.6 M.5,.7333 L.5,.9333" }, "\u250A": { 1: "M.5,.05 L.5,.2 M.5,.3 L.5,.45 L.5,.55 M.5,.7 L.5,.95" }, "\u250B": { 3: "M.5,.05 L.5,.2 M.5,.3 L.5,.45 L.5,.55 M.5,.7 L.5,.95" }, "\u256D": { 1: (i8, e) => `M.5,1 L.5,${0.5 + e / 0.15 * 0.5} C.5,${0.5 + e / 0.15 * 0.5},.5,.5,1,.5` }, "\u256E": { 1: (i8, e) => `M.5,1 L.5,${0.5 + e / 0.15 * 0.5} C.5,${0.5 + e / 0.15 * 0.5},.5,.5,0,.5` }, "\u256F": { 1: (i8, e) => `M.5,0 L.5,${0.5 - e / 0.15 * 0.5} C.5,${0.5 - e / 0.15 * 0.5},.5,.5,0,.5` }, "\u2570": { 1: (i8, e) => `M.5,0 L.5,${0.5 - e / 0.15 * 0.5} C.5,${0.5 - e / 0.15 * 0.5},.5,.5,1,.5` } };
  var et3 = { "\uE0A0": { d: "M.3,1 L.03,1 L.03,.88 C.03,.82,.06,.78,.11,.73 C.15,.7,.2,.68,.28,.65 L.43,.6 C.49,.58,.53,.56,.56,.53 C.59,.5,.6,.47,.6,.43 L.6,.27 L.4,.27 L.69,.1 L.98,.27 L.78,.27 L.78,.46 C.78,.52,.76,.56,.72,.61 C.68,.66,.63,.67,.56,.7 L.48,.72 C.42,.74,.38,.76,.35,.78 C.32,.8,.31,.84,.31,.88 L.31,1 M.3,.5 L.03,.59 L.03,.09 L.3,.09 L.3,.655", type: 0 }, "\uE0A1": { d: "M.7,.4 L.7,.47 L.2,.47 L.2,.03 L.355,.03 L.355,.4 L.705,.4 M.7,.5 L.86,.5 L.86,.95 L.69,.95 L.44,.66 L.46,.86 L.46,.95 L.3,.95 L.3,.49 L.46,.49 L.71,.78 L.69,.565 L.69,.5", type: 0 }, "\uE0A2": { d: "M.25,.94 C.16,.94,.11,.92,.11,.87 L.11,.53 C.11,.48,.15,.455,.23,.45 L.23,.3 C.23,.25,.26,.22,.31,.19 C.36,.16,.43,.15,.51,.15 C.59,.15,.66,.16,.71,.19 C.77,.22,.79,.26,.79,.3 L.79,.45 C.87,.45,.91,.48,.91,.53 L.91,.87 C.91,.92,.86,.94,.77,.94 L.24,.94 M.53,.2 C.49,.2,.45,.21,.42,.23 C.39,.25,.38,.27,.38,.3 L.38,.45 L.68,.45 L.68,.3 C.68,.27,.67,.25,.64,.23 C.61,.21,.58,.2,.53,.2 M.58,.82 L.58,.66 C.63,.65,.65,.63,.65,.6 C.65,.58,.64,.57,.61,.56 C.58,.55,.56,.54,.52,.54 C.48,.54,.46,.55,.43,.56 C.4,.57,.39,.59,.39,.6 C.39,.63,.41,.64,.46,.66 L.46,.82 L.57,.82", type: 0 }, "\uE0B0": { d: "M0,0 L1,.5 L0,1", type: 0, rightPadding: 2 }, "\uE0B1": { d: "M-1,-.5 L1,.5 L-1,1.5", type: 1, leftPadding: 1, rightPadding: 1 }, "\uE0B2": { d: "M1,0 L0,.5 L1,1", type: 0, leftPadding: 2 }, "\uE0B3": { d: "M2,-.5 L0,.5 L2,1.5", type: 1, leftPadding: 1, rightPadding: 1 }, "\uE0B4": { d: "M0,0 L0,1 C0.552,1,1,0.776,1,.5 C1,0.224,0.552,0,0,0", type: 0, rightPadding: 1 }, "\uE0B5": { d: "M.2,1 C.422,1,.8,.826,.78,.5 C.8,.174,0.422,0,.2,0", type: 1, rightPadding: 1 }, "\uE0B6": { d: "M1,0 L1,1 C0.448,1,0,0.776,0,.5 C0,0.224,0.448,0,1,0", type: 0, leftPadding: 1 }, "\uE0B7": { d: "M.8,1 C0.578,1,0.2,.826,.22,.5 C0.2,0.174,0.578,0,0.8,0", type: 1, leftPadding: 1 }, "\uE0B8": { d: "M-.5,-.5 L1.5,1.5 L-.5,1.5", type: 0 }, "\uE0B9": { d: "M-.5,-.5 L1.5,1.5", type: 1, leftPadding: 1, rightPadding: 1 }, "\uE0BA": { d: "M1.5,-.5 L-.5,1.5 L1.5,1.5", type: 0 }, "\uE0BC": { d: "M1.5,-.5 L-.5,1.5 L-.5,-.5", type: 0 }, "\uE0BD": { d: "M1.5,-.5 L-.5,1.5", type: 1, leftPadding: 1, rightPadding: 1 }, "\uE0BE": { d: "M-.5,-.5 L1.5,1.5 L1.5,-.5", type: 0 } };
  et3["\uE0BB"] = et3["\uE0BD"];
  et3["\uE0BF"] = et3["\uE0B9"];
  function yn2(i8, e, t, n, s, o2, r11, a) {
    let l2 = Hr[e];
    if (l2) return $r(i8, l2, t, n, s, o2), true;
    let u = Wr[e];
    if (u) return Kr(i8, u, t, n, s, o2), true;
    let c = Gr[e];
    if (c) return Vr(i8, c, t, n, s, o2, a), true;
    let d = et3[e];
    return d ? (Cr(i8, d, t, n, s, o2, r11, a), true) : false;
  }
  function $r(i8, e, t, n, s, o2) {
    for (let r11 = 0; r11 < e.length; r11++) {
      let a = e[r11], l2 = s / 8, u = o2 / 8;
      i8.fillRect(t + a.x * l2, n + a.y * u, a.w * l2, a.h * u);
    }
  }
  var xn2 = /* @__PURE__ */ new Map();
  function Kr(i8, e, t, n, s, o2) {
    let r11 = xn2.get(e);
    r11 || (r11 = /* @__PURE__ */ new Map(), xn2.set(e, r11));
    let a = i8.fillStyle;
    if (typeof a != "string") throw new Error(`Unexpected fillStyle type "${a}"`);
    let l2 = r11.get(a);
    if (!l2) {
      let u = e[0].length, c = e.length, d = i8.canvas.ownerDocument.createElement("canvas");
      d.width = u, d.height = c;
      let h2 = F3(d.getContext("2d")), f = new ImageData(u, c), I2, L2, M6, q3;
      if (a.startsWith("#")) I2 = parseInt(a.slice(1, 3), 16), L2 = parseInt(a.slice(3, 5), 16), M6 = parseInt(a.slice(5, 7), 16), q3 = a.length > 7 && parseInt(a.slice(7, 9), 16) || 1;
      else if (a.startsWith("rgba")) [I2, L2, M6, q3] = a.substring(5, a.length - 1).split(",").map((S2) => parseFloat(S2));
      else throw new Error(`Unexpected fillStyle color format "${a}" when drawing pattern glyph`);
      for (let S2 = 0; S2 < c; S2++) for (let W3 = 0; W3 < u; W3++) f.data[(S2 * u + W3) * 4] = I2, f.data[(S2 * u + W3) * 4 + 1] = L2, f.data[(S2 * u + W3) * 4 + 2] = M6, f.data[(S2 * u + W3) * 4 + 3] = e[S2][W3] * (q3 * 255);
      h2.putImageData(f, 0, 0), l2 = F3(i8.createPattern(d, null)), r11.set(a, l2);
    }
    i8.fillStyle = l2, i8.fillRect(t, n, s, o2);
  }
  function Vr(i8, e, t, n, s, o2, r11) {
    i8.strokeStyle = i8.fillStyle;
    for (let [a, l2] of Object.entries(e)) {
      i8.beginPath(), i8.lineWidth = r11 * Number.parseInt(a);
      let u;
      if (typeof l2 == "function") {
        let d = 0.15 / o2 * s;
        u = l2(0.15, d);
      } else u = l2;
      for (let c of u.split(" ")) {
        let d = c[0], h2 = In2[d];
        if (!h2) {
          console.error(`Could not find drawing instructions for "${d}"`);
          continue;
        }
        let f = c.substring(1).split(",");
        !f[0] || !f[1] || h2(i8, Ln(f, s, o2, t, n, true, r11));
      }
      i8.stroke(), i8.closePath();
    }
  }
  function Cr(i8, e, t, n, s, o2, r11, a) {
    let l2 = new Path2D();
    l2.rect(t, n, s, o2), i8.clip(l2), i8.beginPath();
    let u = r11 / 12;
    i8.lineWidth = a * u;
    for (let c of e.d.split(" ")) {
      let d = c[0], h2 = In2[d];
      if (!h2) {
        console.error(`Could not find drawing instructions for "${d}"`);
        continue;
      }
      let f = c.substring(1).split(",");
      !f[0] || !f[1] || h2(i8, Ln(f, s, o2, t, n, false, a, (e.leftPadding ?? 0) * (u / 2), (e.rightPadding ?? 0) * (u / 2)));
    }
    e.type === 1 ? (i8.strokeStyle = i8.fillStyle, i8.stroke()) : i8.fill(), i8.closePath();
  }
  function En(i8, e, t = 0) {
    return Math.max(Math.min(i8, e), t);
  }
  var In2 = { C: (i8, e) => i8.bezierCurveTo(e[0], e[1], e[2], e[3], e[4], e[5]), L: (i8, e) => i8.lineTo(e[0], e[1]), M: (i8, e) => i8.moveTo(e[0], e[1]) };
  function Ln(i8, e, t, n, s, o2, r11, a = 0, l2 = 0) {
    let u = i8.map((c) => parseFloat(c) || parseInt(c));
    if (u.length < 2) throw new Error("Too few arguments for instruction");
    for (let c = 0; c < u.length; c += 2) u[c] *= e - a * r11 - l2 * r11, o2 && u[c] !== 0 && (u[c] = En(Math.round(u[c] + 0.5) - 0.5, e, 0)), u[c] += n + a * r11;
    for (let c = 1; c < u.length; c += 2) u[c] *= t, o2 && u[c] !== 0 && (u[c] = En(Math.round(u[c] + 0.5) - 0.5, t, 0)), u[c] += s;
    return u;
  }
  var Ot2 = class {
    constructor() {
      this._data = {};
    }
    set(e, t, n) {
      this._data[e] || (this._data[e] = {}), this._data[e][t] = n;
    }
    get(e, t) {
      return this._data[e] ? this._data[e][t] : void 0;
    }
    clear() {
      this._data = {};
    }
  };
  var tt4 = class {
    constructor() {
      this._data = new Ot2();
    }
    set(e, t, n, s, o2) {
      this._data.get(e, t) || this._data.set(e, t, new Ot2()), this._data.get(e, t).set(n, s, o2);
    }
    get(e, t, n, s) {
      return this._data.get(e, t)?.get(n, s);
    }
    clear() {
      this._data.clear();
    }
  };
  var Ft2 = class {
    constructor() {
      this._tasks = [];
      this._i = 0;
    }
    enqueue(e) {
      this._tasks.push(e), this._start();
    }
    flush() {
      for (; this._i < this._tasks.length; ) this._tasks[this._i]() || this._i++;
      this.clear();
    }
    clear() {
      this._idleCallback && (this._cancelCallback(this._idleCallback), this._idleCallback = void 0), this._i = 0, this._tasks.length = 0;
    }
    _start() {
      this._idleCallback || (this._idleCallback = this._requestCallback(this._process.bind(this)));
    }
    _process(e) {
      this._idleCallback = void 0;
      let t = 0, n = 0, s = e.timeRemaining(), o2 = 0;
      for (; this._i < this._tasks.length; ) {
        if (t = performance.now(), this._tasks[this._i]() || this._i++, t = Math.max(1, performance.now() - t), n = Math.max(t, n), o2 = e.timeRemaining(), n * 1.5 > o2) {
          s - t < -20 && console.warn(`task queue exceeded allotted deadline by ${Math.abs(Math.round(s - t))}ms`), this._start();
          return;
        }
        s = o2;
      }
      this.clear();
    }
  };
  var gi = class extends Ft2 {
    _requestCallback(e) {
      return setTimeout(() => e(this._createDeadline(16)));
    }
    _cancelCallback(e) {
      clearTimeout(e);
    }
    _createDeadline(e) {
      let t = performance.now() + e;
      return { timeRemaining: () => Math.max(0, t - performance.now()) };
    }
  };
  var xi = class extends Ft2 {
    _requestCallback(e) {
      return requestIdleCallback(e);
    }
    _cancelCallback(e) {
      cancelIdleCallback(e);
    }
  };
  var wn = !Lt2 && "requestIdleCallback" in window ? xi : gi;
  var he4 = class i2 {
    constructor() {
      this.fg = 0;
      this.bg = 0;
      this.extended = new it4();
    }
    static toColorRGB(e) {
      return [e >>> 16 & 255, e >>> 8 & 255, e & 255];
    }
    static fromColorRGB(e) {
      return (e[0] & 255) << 16 | (e[1] & 255) << 8 | e[2] & 255;
    }
    clone() {
      let e = new i2();
      return e.fg = this.fg, e.bg = this.bg, e.extended = this.extended.clone(), e;
    }
    isInverse() {
      return this.fg & 67108864;
    }
    isBold() {
      return this.fg & 134217728;
    }
    isUnderline() {
      return this.hasExtendedAttrs() && this.extended.underlineStyle !== 0 ? 1 : this.fg & 268435456;
    }
    isBlink() {
      return this.fg & 536870912;
    }
    isInvisible() {
      return this.fg & 1073741824;
    }
    isItalic() {
      return this.bg & 67108864;
    }
    isDim() {
      return this.bg & 134217728;
    }
    isStrikethrough() {
      return this.fg & 2147483648;
    }
    isProtected() {
      return this.bg & 536870912;
    }
    isOverline() {
      return this.bg & 1073741824;
    }
    getFgColorMode() {
      return this.fg & 50331648;
    }
    getBgColorMode() {
      return this.bg & 50331648;
    }
    isFgRGB() {
      return (this.fg & 50331648) === 50331648;
    }
    isBgRGB() {
      return (this.bg & 50331648) === 50331648;
    }
    isFgPalette() {
      return (this.fg & 50331648) === 16777216 || (this.fg & 50331648) === 33554432;
    }
    isBgPalette() {
      return (this.bg & 50331648) === 16777216 || (this.bg & 50331648) === 33554432;
    }
    isFgDefault() {
      return (this.fg & 50331648) === 0;
    }
    isBgDefault() {
      return (this.bg & 50331648) === 0;
    }
    isAttributeDefault() {
      return this.fg === 0 && this.bg === 0;
    }
    getFgColor() {
      switch (this.fg & 50331648) {
        case 16777216:
        case 33554432:
          return this.fg & 255;
        case 50331648:
          return this.fg & 16777215;
        default:
          return -1;
      }
    }
    getBgColor() {
      switch (this.bg & 50331648) {
        case 16777216:
        case 33554432:
          return this.bg & 255;
        case 50331648:
          return this.bg & 16777215;
        default:
          return -1;
      }
    }
    hasExtendedAttrs() {
      return this.bg & 268435456;
    }
    updateExtended() {
      this.extended.isEmpty() ? this.bg &= -268435457 : this.bg |= 268435456;
    }
    getUnderlineColor() {
      if (this.bg & 268435456 && ~this.extended.underlineColor) switch (this.extended.underlineColor & 50331648) {
        case 16777216:
        case 33554432:
          return this.extended.underlineColor & 255;
        case 50331648:
          return this.extended.underlineColor & 16777215;
        default:
          return this.getFgColor();
      }
      return this.getFgColor();
    }
    getUnderlineColorMode() {
      return this.bg & 268435456 && ~this.extended.underlineColor ? this.extended.underlineColor & 50331648 : this.getFgColorMode();
    }
    isUnderlineColorRGB() {
      return this.bg & 268435456 && ~this.extended.underlineColor ? (this.extended.underlineColor & 50331648) === 50331648 : this.isFgRGB();
    }
    isUnderlineColorPalette() {
      return this.bg & 268435456 && ~this.extended.underlineColor ? (this.extended.underlineColor & 50331648) === 16777216 || (this.extended.underlineColor & 50331648) === 33554432 : this.isFgPalette();
    }
    isUnderlineColorDefault() {
      return this.bg & 268435456 && ~this.extended.underlineColor ? (this.extended.underlineColor & 50331648) === 0 : this.isFgDefault();
    }
    getUnderlineStyle() {
      return this.fg & 268435456 ? this.bg & 268435456 ? this.extended.underlineStyle : 1 : 0;
    }
    getUnderlineVariantOffset() {
      return this.extended.underlineVariantOffset;
    }
  };
  var it4 = class i3 {
    constructor(e = 0, t = 0) {
      this._ext = 0;
      this._urlId = 0;
      this._ext = e, this._urlId = t;
    }
    get ext() {
      return this._urlId ? this._ext & -469762049 | this.underlineStyle << 26 : this._ext;
    }
    set ext(e) {
      this._ext = e;
    }
    get underlineStyle() {
      return this._urlId ? 5 : (this._ext & 469762048) >> 26;
    }
    set underlineStyle(e) {
      this._ext &= -469762049, this._ext |= e << 26 & 469762048;
    }
    get underlineColor() {
      return this._ext & 67108863;
    }
    set underlineColor(e) {
      this._ext &= -67108864, this._ext |= e & 67108863;
    }
    get urlId() {
      return this._urlId;
    }
    set urlId(e) {
      this._urlId = e;
    }
    get underlineVariantOffset() {
      let e = (this._ext & 3758096384) >> 29;
      return e < 0 ? e ^ 4294967288 : e;
    }
    set underlineVariantOffset(e) {
      this._ext &= 536870911, this._ext |= e << 29 & 3758096384;
    }
    clone() {
      return new i3(this._ext, this._urlId);
    }
    isEmpty() {
      return this.underlineStyle === 0 && this._urlId === 0;
    }
  };
  var He3 = class He4 {
    constructor(e) {
      this.element = e, this.next = He4.Undefined, this.prev = He4.Undefined;
    }
  };
  He3.Undefined = new He3(void 0);
  var zr = globalThis.performance && typeof globalThis.performance.now == "function";
  var kt2 = class i4 {
    static create(e) {
      return new i4(e);
    }
    constructor(e) {
      this._now = zr && e === false ? Date.now : globalThis.performance.now.bind(globalThis.performance), this._startTime = this._now(), this._stopTime = -1;
    }
    stop() {
      this._stopTime = this._now();
    }
    reset() {
      this._startTime = this._now(), this._stopTime = -1;
    }
    elapsed() {
      return this._stopTime !== -1 ? this._stopTime - this._startTime : this._now() - this._startTime;
    }
  };
  var qr = false;
  var Dn2 = false;
  var jr = false;
  var ee5;
  ((se3) => {
    se3.None = () => B3.None;
    function e(v3) {
      if (jr) {
        let { onDidAddListener: p } = v3, g2 = nt4.create(), b = 0;
        v3.onDidAddListener = () => {
          ++b === 2 && (console.warn("snapshotted emitter LIKELY used public and SHOULD HAVE BEEN created with DisposableStore. snapshotted here"), g2.print()), p?.();
        };
      }
    }
    function t(v3, p) {
      return h2(v3, () => {
      }, 0, void 0, true, void 0, p);
    }
    se3.defer = t;
    function n(v3) {
      return (p, g2 = null, b) => {
        let m = false, _4;
        return _4 = v3((T2) => {
          if (!m) return _4 ? _4.dispose() : m = true, p.call(g2, T2);
        }, null, b), m && _4.dispose(), _4;
      };
    }
    se3.once = n;
    function s(v3, p, g2) {
      return c((b, m = null, _4) => v3((T2) => b.call(m, p(T2)), null, _4), g2);
    }
    se3.map = s;
    function o2(v3, p, g2) {
      return c((b, m = null, _4) => v3((T2) => {
        p(T2), b.call(m, T2);
      }, null, _4), g2);
    }
    se3.forEach = o2;
    function r11(v3, p, g2) {
      return c((b, m = null, _4) => v3((T2) => p(T2) && b.call(m, T2), null, _4), g2);
    }
    se3.filter = r11;
    function a(v3) {
      return v3;
    }
    se3.signal = a;
    function l2(...v3) {
      return (p, g2 = null, b) => {
        let m = It3(...v3.map((_4) => _4((T2) => p.call(g2, T2))));
        return d(m, b);
      };
    }
    se3.any = l2;
    function u(v3, p, g2, b) {
      let m = g2;
      return s(v3, (_4) => (m = p(m, _4), m), b);
    }
    se3.reduce = u;
    function c(v3, p) {
      let g2, b = { onWillAddFirstListener() {
        g2 = v3(m.fire, m);
      }, onDidRemoveLastListener() {
        g2?.dispose();
      } };
      p || e(b);
      let m = new D(b);
      return p?.add(m), m.event;
    }
    function d(v3, p) {
      return p instanceof Array ? p.push(v3) : p && p.add(v3), v3;
    }
    function h2(v3, p, g2 = 100, b = false, m = false, _4, T2) {
      let x, R3, $4, P5 = 0, de4, Re4 = { leakWarningThreshold: _4, onWillAddFirstListener() {
        x = v3((ie5) => {
          P5++, R3 = p(R3, ie5), b && !$4 && (oe.fire(R3), R3 = void 0), de4 = () => {
            let N4 = R3;
            R3 = void 0, $4 = void 0, (!b || P5 > 1) && oe.fire(N4), P5 = 0;
          }, typeof g2 == "number" ? (clearTimeout($4), $4 = setTimeout(de4, g2)) : $4 === void 0 && ($4 = 0, queueMicrotask(de4));
        });
      }, onWillRemoveListener() {
        m && P5 > 0 && de4?.();
      }, onDidRemoveLastListener() {
        de4 = void 0, x.dispose();
      } };
      T2 || e(Re4);
      let oe = new D(Re4);
      return T2?.add(oe), oe.event;
    }
    se3.debounce = h2;
    function f(v3, p = 0, g2) {
      return se3.debounce(v3, (b, m) => b ? (b.push(m), b) : [m], p, void 0, true, void 0, g2);
    }
    se3.accumulate = f;
    function I2(v3, p = (b, m) => b === m, g2) {
      let b = true, m;
      return r11(v3, (_4) => {
        let T2 = b || !p(_4, m);
        return b = false, m = _4, T2;
      }, g2);
    }
    se3.latch = I2;
    function L2(v3, p, g2) {
      return [se3.filter(v3, p, g2), se3.filter(v3, (b) => !p(b), g2)];
    }
    se3.split = L2;
    function M6(v3, p = false, g2 = [], b) {
      let m = g2.slice(), _4 = v3((R3) => {
        m ? m.push(R3) : x.fire(R3);
      });
      b && b.add(_4);
      let T2 = () => {
        m?.forEach((R3) => x.fire(R3)), m = null;
      }, x = new D({ onWillAddFirstListener() {
        _4 || (_4 = v3((R3) => x.fire(R3)), b && b.add(_4));
      }, onDidAddFirstListener() {
        m && (p ? setTimeout(T2) : T2());
      }, onDidRemoveLastListener() {
        _4 && _4.dispose(), _4 = null;
      } });
      return b && b.add(x), x.event;
    }
    se3.buffer = M6;
    function q3(v3, p) {
      return (b, m, _4) => {
        let T2 = p(new W3());
        return v3(function(x) {
          let R3 = T2.evaluate(x);
          R3 !== S2 && b.call(m, R3);
        }, void 0, _4);
      };
    }
    se3.chain = q3;
    let S2 = Symbol("HaltChainable");
    class W3 {
      constructor() {
        this.steps = [];
      }
      map(p) {
        return this.steps.push(p), this;
      }
      forEach(p) {
        return this.steps.push((g2) => (p(g2), g2)), this;
      }
      filter(p) {
        return this.steps.push((g2) => p(g2) ? g2 : S2), this;
      }
      reduce(p, g2) {
        let b = g2;
        return this.steps.push((m) => (b = p(b, m), b)), this;
      }
      latch(p = (g2, b) => g2 === b) {
        let g2 = true, b;
        return this.steps.push((m) => {
          let _4 = g2 || !p(m, b);
          return g2 = false, b = m, _4 ? m : S2;
        }), this;
      }
      evaluate(p) {
        for (let g2 of this.steps) if (p = g2(p), p === S2) break;
        return p;
      }
    }
    function E(v3, p, g2 = (b) => b) {
      let b = (...x) => T2.fire(g2(...x)), m = () => v3.on(p, b), _4 = () => v3.removeListener(p, b), T2 = new D({ onWillAddFirstListener: m, onDidRemoveLastListener: _4 });
      return T2.event;
    }
    se3.fromNodeEventEmitter = E;
    function y(v3, p, g2 = (b) => b) {
      let b = (...x) => T2.fire(g2(...x)), m = () => v3.addEventListener(p, b), _4 = () => v3.removeEventListener(p, b), T2 = new D({ onWillAddFirstListener: m, onDidRemoveLastListener: _4 });
      return T2.event;
    }
    se3.fromDOMEventEmitter = y;
    function w4(v3) {
      return new Promise((p) => n(v3)(p));
    }
    se3.toPromise = w4;
    function G4(v3) {
      let p = new D();
      return v3.then((g2) => {
        p.fire(g2);
      }, () => {
        p.fire(void 0);
      }).finally(() => {
        p.dispose();
      }), p.event;
    }
    se3.fromPromise = G4;
    function ue5(v3, p) {
      return v3((g2) => p.fire(g2));
    }
    se3.forward = ue5;
    function Se2(v3, p, g2) {
      return p(g2), v3((b) => p(b));
    }
    se3.runAndSubscribe = Se2;
    class ce4 {
      constructor(p, g2) {
        this._observable = p;
        this._counter = 0;
        this._hasChanged = false;
        let b = { onWillAddFirstListener: () => {
          p.addObserver(this);
        }, onDidRemoveLastListener: () => {
          p.removeObserver(this);
        } };
        g2 || e(b), this.emitter = new D(b), g2 && g2.add(this.emitter);
      }
      beginUpdate(p) {
        this._counter++;
      }
      handlePossibleChange(p) {
      }
      handleChange(p, g2) {
        this._hasChanged = true;
      }
      endUpdate(p) {
        this._counter--, this._counter === 0 && (this._observable.reportChanges(), this._hasChanged && (this._hasChanged = false, this.emitter.fire(this._observable.get())));
      }
    }
    function we3(v3, p) {
      return new ce4(v3, p).emitter.event;
    }
    se3.fromObservable = we3;
    function A3(v3) {
      return (p, g2, b) => {
        let m = 0, _4 = false, T2 = { beginUpdate() {
          m++;
        }, endUpdate() {
          m--, m === 0 && (v3.reportChanges(), _4 && (_4 = false, p.call(g2)));
        }, handlePossibleChange() {
        }, handleChange() {
          _4 = true;
        } };
        v3.addObserver(T2), v3.reportChanges();
        let x = { dispose() {
          v3.removeObserver(T2);
        } };
        return b instanceof fe4 ? b.add(x) : Array.isArray(b) && b.push(x), x;
      };
    }
    se3.fromObservableLight = A3;
  })(ee5 || (ee5 = {}));
  var We4 = class We5 {
    constructor(e) {
      this.listenerCount = 0;
      this.invocationCount = 0;
      this.elapsedOverall = 0;
      this.durations = [];
      this.name = `${e}_${We5._idPool++}`, We5.all.add(this);
    }
    start(e) {
      this._stopWatch = new kt2(), this.listenerCount = e;
    }
    stop() {
      if (this._stopWatch) {
        let e = this._stopWatch.elapsed();
        this.durations.push(e), this.elapsedOverall += e, this.invocationCount += 1, this._stopWatch = void 0;
      }
    }
  };
  We4.all = /* @__PURE__ */ new Set(), We4._idPool = 0;
  var Ei = We4;
  var Mn = -1;
  var Bt = class Bt2 {
    constructor(e, t, n = (Bt2._idPool++).toString(16).padStart(3, "0")) {
      this._errorHandler = e;
      this.threshold = t;
      this.name = n;
      this._warnCountdown = 0;
    }
    dispose() {
      this._stacks?.clear();
    }
    check(e, t) {
      let n = this.threshold;
      if (n <= 0 || t < n) return;
      this._stacks || (this._stacks = /* @__PURE__ */ new Map());
      let s = this._stacks.get(e.value) || 0;
      if (this._stacks.set(e.value, s + 1), this._warnCountdown -= 1, this._warnCountdown <= 0) {
        this._warnCountdown = n * 0.5;
        let [o2, r11] = this.getMostFrequentStack(), a = `[${this.name}] potential listener LEAK detected, having ${t} listeners already. MOST frequent listener (${r11}):`;
        console.warn(a), console.warn(o2);
        let l2 = new Ii(a, o2);
        this._errorHandler(l2);
      }
      return () => {
        let o2 = this._stacks.get(e.value) || 0;
        this._stacks.set(e.value, o2 - 1);
      };
    }
    getMostFrequentStack() {
      if (!this._stacks) return;
      let e, t = 0;
      for (let [n, s] of this._stacks) (!e || t < s) && (e = [n, s], t = s);
      return e;
    }
  };
  Bt._idPool = 1;
  var yi = Bt;
  var nt4 = class i5 {
    constructor(e) {
      this.value = e;
    }
    static create() {
      let e = new Error();
      return new i5(e.stack ?? "");
    }
    print() {
      console.warn(this.value.split(`
`).slice(2).join(`
`));
    }
  };
  var Ii = class extends Error {
    constructor(e, t) {
      super(e), this.name = "ListenerLeakError", this.stack = t;
    }
  };
  var Li = class extends Error {
    constructor(e, t) {
      super(e), this.name = "ListenerRefusalError", this.stack = t;
    }
  };
  var Xr = 0;
  var Ge4 = class {
    constructor(e) {
      this.value = e;
      this.id = Xr++;
    }
  };
  var Yr = 2;
  var Qr = (i8, e) => {
    if (i8 instanceof Ge4) e(i8);
    else for (let t = 0; t < i8.length; t++) {
      let n = i8[t];
      n && e(n);
    }
  };
  var Pt2;
  if (qr) {
    let i8 = [];
    setInterval(() => {
      i8.length !== 0 && (console.warn("[LEAKING LISTENERS] GC'ed these listeners that were NOT yet disposed:"), console.warn(i8.join(`
`)), i8.length = 0);
    }, 3e3), Pt2 = new FinalizationRegistry((e) => {
      typeof e == "string" && i8.push(e);
    });
  }
  var D = class {
    constructor(e) {
      this._size = 0;
      this._options = e, this._leakageMon = Mn > 0 || this._options?.leakWarningThreshold ? new yi(e?.onListenerError ?? Pe4, this._options?.leakWarningThreshold ?? Mn) : void 0, this._perfMon = this._options?._profName ? new Ei(this._options._profName) : void 0, this._deliveryQueue = this._options?.deliveryQueue;
    }
    dispose() {
      if (!this._disposed) {
        if (this._disposed = true, this._deliveryQueue?.current === this && this._deliveryQueue.reset(), this._listeners) {
          if (Dn2) {
            let e = this._listeners;
            queueMicrotask(() => {
              Qr(e, (t) => t.stack?.print());
            });
          }
          this._listeners = void 0, this._size = 0;
        }
        this._options?.onDidRemoveLastListener?.(), this._leakageMon?.dispose();
      }
    }
    get event() {
      return this._event ?? (this._event = (e, t, n) => {
        if (this._leakageMon && this._size > this._leakageMon.threshold ** 2) {
          let l2 = `[${this._leakageMon.name}] REFUSES to accept new listeners because it exceeded its threshold by far (${this._size} vs ${this._leakageMon.threshold})`;
          console.warn(l2);
          let u = this._leakageMon.getMostFrequentStack() ?? ["UNKNOWN stack", -1], c = new Li(`${l2}. HINT: Stack shows most frequent listener (${u[1]}-times)`, u[0]);
          return (this._options?.onListenerError || Pe4)(c), B3.None;
        }
        if (this._disposed) return B3.None;
        t && (e = e.bind(t));
        let s = new Ge4(e), o2, r11;
        this._leakageMon && this._size >= Math.ceil(this._leakageMon.threshold * 0.2) && (s.stack = nt4.create(), o2 = this._leakageMon.check(s.stack, this._size + 1)), Dn2 && (s.stack = r11 ?? nt4.create()), this._listeners ? this._listeners instanceof Ge4 ? (this._deliveryQueue ?? (this._deliveryQueue = new wi()), this._listeners = [this._listeners, s]) : this._listeners.push(s) : (this._options?.onWillAddFirstListener?.(this), this._listeners = s, this._options?.onDidAddFirstListener?.(this)), this._size++;
        let a = O3(() => {
          Pt2?.unregister(a), o2?.(), this._removeListener(s);
        });
        if (n instanceof fe4 ? n.add(a) : Array.isArray(n) && n.push(a), Pt2) {
          let l2 = new Error().stack.split(`
`).slice(2, 3).join(`
`).trim(), u = /(file:|vscode-file:\/\/vscode-app)?(\/[^:]*:\d+:\d+)/.exec(l2);
          Pt2.register(a, u?.[2] ?? l2, a);
        }
        return a;
      }), this._event;
    }
    _removeListener(e) {
      if (this._options?.onWillRemoveListener?.(this), !this._listeners) return;
      if (this._size === 1) {
        this._listeners = void 0, this._options?.onDidRemoveLastListener?.(this), this._size = 0;
        return;
      }
      let t = this._listeners, n = t.indexOf(e);
      if (n === -1) throw console.log("disposed?", this._disposed), console.log("size?", this._size), console.log("arr?", JSON.stringify(this._listeners)), new Error("Attempted to dispose unknown listener");
      this._size--, t[n] = void 0;
      let s = this._deliveryQueue.current === this;
      if (this._size * Yr <= t.length) {
        let o2 = 0;
        for (let r11 = 0; r11 < t.length; r11++) t[r11] ? t[o2++] = t[r11] : s && (this._deliveryQueue.end--, o2 < this._deliveryQueue.i && this._deliveryQueue.i--);
        t.length = o2;
      }
    }
    _deliver(e, t) {
      if (!e) return;
      let n = this._options?.onListenerError || Pe4;
      if (!n) {
        e.value(t);
        return;
      }
      try {
        e.value(t);
      } catch (s) {
        n(s);
      }
    }
    _deliverQueue(e) {
      let t = e.current._listeners;
      for (; e.i < e.end; ) this._deliver(t[e.i++], e.value);
      e.reset();
    }
    fire(e) {
      if (this._deliveryQueue?.current && (this._deliverQueue(this._deliveryQueue), this._perfMon?.stop()), this._perfMon?.start(this._size), this._listeners) if (this._listeners instanceof Ge4) this._deliver(this._listeners, e);
      else {
        let t = this._deliveryQueue;
        t.enqueue(this, e, this._listeners.length), this._deliverQueue(t);
      }
      this._perfMon?.stop();
    }
    hasListeners() {
      return this._size > 0;
    }
  };
  var wi = class {
    constructor() {
      this.i = -1;
      this.end = 0;
    }
    enqueue(e, t, n) {
      this.i = 0, this.end = n, this.current = e, this.value = t;
    }
    reset() {
      this.i = this.end, this.current = void 0, this.value = void 0;
    }
  };
  var An = { texturePage: 0, texturePosition: { x: 0, y: 0 }, texturePositionClipSpace: { x: 0, y: 0 }, offset: { x: 0, y: 0 }, size: { x: 0, y: 0 }, sizeClipSpace: { x: 0, y: 0 } };
  var rt3 = 2;
  var st4;
  var ae2 = class i6 {
    constructor(e, t, n) {
      this._document = e;
      this._config = t;
      this._unicodeService = n;
      this._didWarmUp = false;
      this._cacheMap = new tt4();
      this._cacheMapCombined = new tt4();
      this._pages = [];
      this._activePages = [];
      this._workBoundingBox = { top: 0, left: 0, bottom: 0, right: 0 };
      this._workAttributeData = new he4();
      this._textureSize = 512;
      this._onAddTextureAtlasCanvas = new D();
      this.onAddTextureAtlasCanvas = this._onAddTextureAtlasCanvas.event;
      this._onRemoveTextureAtlasCanvas = new D();
      this.onRemoveTextureAtlasCanvas = this._onRemoveTextureAtlasCanvas.event;
      this._requestClearModel = false;
      this._createNewPage(), this._tmpCanvas = Sn(e, this._config.deviceCellWidth * 4 + rt3 * 2, this._config.deviceCellHeight + rt3 * 2), this._tmpCtx = F3(this._tmpCanvas.getContext("2d", { alpha: this._config.allowTransparency, willReadFrequently: true }));
    }
    get pages() {
      return this._pages;
    }
    dispose() {
      this._tmpCanvas.remove();
      for (let e of this.pages) e.canvas.remove();
      this._onAddTextureAtlasCanvas.dispose();
    }
    warmUp() {
      this._didWarmUp || (this._doWarmUp(), this._didWarmUp = true);
    }
    _doWarmUp() {
      let e = new wn();
      for (let t = 33; t < 126; t++) e.enqueue(() => {
        if (!this._cacheMap.get(t, 0, 0, 0)) {
          let n = this._drawToCache(t, 0, 0, 0, false, void 0);
          this._cacheMap.set(t, 0, 0, 0, n);
        }
      });
    }
    beginFrame() {
      return this._requestClearModel;
    }
    clearTexture() {
      if (!(this._pages[0].currentRow.x === 0 && this._pages[0].currentRow.y === 0)) {
        for (let e of this._pages) e.clear();
        this._cacheMap.clear(), this._cacheMapCombined.clear(), this._didWarmUp = false;
      }
    }
    _createNewPage() {
      if (i6.maxAtlasPages && this._pages.length >= Math.max(4, i6.maxAtlasPages)) {
        let t = this._pages.filter((u) => u.canvas.width * 2 <= (i6.maxTextureSize || 4096)).sort((u, c) => c.canvas.width !== u.canvas.width ? c.canvas.width - u.canvas.width : c.percentageUsed - u.percentageUsed), n = -1, s = 0;
        for (let u = 0; u < t.length; u++) if (t[u].canvas.width !== s) n = u, s = t[u].canvas.width;
        else if (u - n === 3) break;
        let o2 = t.slice(n, n + 4), r11 = o2.map((u) => u.glyphs[0].texturePage).sort((u, c) => u > c ? 1 : -1), a = this.pages.length - o2.length, l2 = this._mergePages(o2, a);
        l2.version++;
        for (let u = r11.length - 1; u >= 0; u--) this._deletePage(r11[u]);
        this.pages.push(l2), this._requestClearModel = true, this._onAddTextureAtlasCanvas.fire(l2.canvas);
      }
      let e = new ot4(this._document, this._textureSize);
      return this._pages.push(e), this._activePages.push(e), this._onAddTextureAtlasCanvas.fire(e.canvas), e;
    }
    _mergePages(e, t) {
      let n = e[0].canvas.width * 2, s = new ot4(this._document, n, e);
      for (let [o2, r11] of e.entries()) {
        let a = o2 * r11.canvas.width % n, l2 = Math.floor(o2 / 2) * r11.canvas.height;
        s.ctx.drawImage(r11.canvas, a, l2);
        for (let c of r11.glyphs) c.texturePage = t, c.sizeClipSpace.x = c.size.x / n, c.sizeClipSpace.y = c.size.y / n, c.texturePosition.x += a, c.texturePosition.y += l2, c.texturePositionClipSpace.x = c.texturePosition.x / n, c.texturePositionClipSpace.y = c.texturePosition.y / n;
        this._onRemoveTextureAtlasCanvas.fire(r11.canvas);
        let u = this._activePages.indexOf(r11);
        u !== -1 && this._activePages.splice(u, 1);
      }
      return s;
    }
    _deletePage(e) {
      this._pages.splice(e, 1);
      for (let t = e; t < this._pages.length; t++) {
        let n = this._pages[t];
        for (let s of n.glyphs) s.texturePage--;
        n.version++;
      }
    }
    getRasterizedGlyphCombinedChar(e, t, n, s, o2, r11) {
      return this._getFromCacheMap(this._cacheMapCombined, e, t, n, s, o2, r11);
    }
    getRasterizedGlyph(e, t, n, s, o2, r11) {
      return this._getFromCacheMap(this._cacheMap, e, t, n, s, o2, r11);
    }
    _getFromCacheMap(e, t, n, s, o2, r11, a) {
      return st4 = e.get(t, n, s, o2), st4 || (st4 = this._drawToCache(t, n, s, o2, r11, a), e.set(t, n, s, o2, st4)), st4;
    }
    _getColorFromAnsiIndex(e) {
      if (e >= this._config.colors.ansi.length) throw new Error("No color found for idx " + e);
      return this._config.colors.ansi[e];
    }
    _getBackgroundColor(e, t, n, s) {
      if (this._config.allowTransparency) return Z4;
      let o2;
      switch (e) {
        case 16777216:
        case 33554432:
          o2 = this._getColorFromAnsiIndex(t);
          break;
        case 50331648:
          let r11 = he4.toColorRGB(t);
          o2 = X5.toColor(r11[0], r11[1], r11[2]);
          break;
        case 0:
        default:
          n ? o2 = Ue3.opaque(this._config.colors.foreground) : o2 = this._config.colors.background;
          break;
      }
      return this._config.allowTransparency || (o2 = Ue3.opaque(o2)), o2;
    }
    _getForegroundColor(e, t, n, s, o2, r11, a, l2, u, c) {
      let d = this._getMinimumContrastColor(e, t, n, s, o2, r11, a, u, l2, c);
      if (d) return d;
      let h2;
      switch (o2) {
        case 16777216:
        case 33554432:
          this._config.drawBoldTextInBrightColors && u && r11 < 8 && (r11 += 8), h2 = this._getColorFromAnsiIndex(r11);
          break;
        case 50331648:
          let f = he4.toColorRGB(r11);
          h2 = X5.toColor(f[0], f[1], f[2]);
          break;
        case 0:
        default:
          a ? h2 = this._config.colors.background : h2 = this._config.colors.foreground;
      }
      return this._config.allowTransparency && (h2 = Ue3.opaque(h2)), l2 && (h2 = Ue3.multiplyOpacity(h2, gn2)), h2;
    }
    _resolveBackgroundRgba(e, t, n) {
      switch (e) {
        case 16777216:
        case 33554432:
          return this._getColorFromAnsiIndex(t).rgba;
        case 50331648:
          return t << 8;
        case 0:
        default:
          return n ? this._config.colors.foreground.rgba : this._config.colors.background.rgba;
      }
    }
    _resolveForegroundRgba(e, t, n, s) {
      switch (e) {
        case 16777216:
        case 33554432:
          return this._config.drawBoldTextInBrightColors && s && t < 8 && (t += 8), this._getColorFromAnsiIndex(t).rgba;
        case 50331648:
          return t << 8;
        case 0:
        default:
          return n ? this._config.colors.background.rgba : this._config.colors.foreground.rgba;
      }
    }
    _getMinimumContrastColor(e, t, n, s, o2, r11, a, l2, u, c) {
      if (this._config.minimumContrastRatio === 1 || c) return;
      let d = this._getContrastCache(u), h2 = d.getColor(e, s);
      if (h2 !== void 0) return h2 || void 0;
      let f = this._resolveBackgroundRgba(t, n, a), I2 = this._resolveForegroundRgba(o2, r11, a, l2), L2 = Te3.ensureContrastRatio(f, I2, this._config.minimumContrastRatio / (u ? 2 : 1));
      if (!L2) {
        d.setColor(e, s, null);
        return;
      }
      let M6 = X5.toColor(L2 >> 24 & 255, L2 >> 16 & 255, L2 >> 8 & 255);
      return d.setColor(e, s, M6), M6;
    }
    _getContrastCache(e) {
      return e ? this._config.colors.halfContrastCache : this._config.colors.contrastCache;
    }
    _drawToCache(e, t, n, s, o2, r11) {
      let a = typeof e == "number" ? String.fromCharCode(e) : e;
      r11 && this._tmpCanvas.parentElement !== r11 && (this._tmpCanvas.style.display = "none", r11.append(this._tmpCanvas));
      let l2 = Math.min(this._config.deviceCellWidth * Math.max(a.length, 2) + rt3 * 2, this._config.deviceMaxTextureSize);
      this._tmpCanvas.width < l2 && (this._tmpCanvas.width = l2);
      let u = Math.min(this._config.deviceCellHeight + rt3 * 4, this._textureSize);
      if (this._tmpCanvas.height < u && (this._tmpCanvas.height = u), this._tmpCtx.save(), this._workAttributeData.fg = n, this._workAttributeData.bg = t, this._workAttributeData.extended.ext = s, !!this._workAttributeData.isInvisible()) return An;
      let d = !!this._workAttributeData.isBold(), h2 = !!this._workAttributeData.isInverse(), f = !!this._workAttributeData.isDim(), I2 = !!this._workAttributeData.isItalic(), L2 = !!this._workAttributeData.isUnderline(), M6 = !!this._workAttributeData.isStrikethrough(), q3 = !!this._workAttributeData.isOverline(), S2 = this._workAttributeData.getFgColor(), W3 = this._workAttributeData.getFgColorMode(), E = this._workAttributeData.getBgColor(), y = this._workAttributeData.getBgColorMode();
      if (h2) {
        let x = S2;
        S2 = E, E = x;
        let R3 = W3;
        W3 = y, y = R3;
      }
      let w4 = this._getBackgroundColor(y, E, h2, f);
      this._tmpCtx.globalCompositeOperation = "copy", this._tmpCtx.fillStyle = w4.css, this._tmpCtx.fillRect(0, 0, this._tmpCanvas.width, this._tmpCanvas.height), this._tmpCtx.globalCompositeOperation = "source-over";
      let G4 = d ? this._config.fontWeightBold : this._config.fontWeight, ue5 = I2 ? "italic" : "";
      this._tmpCtx.font = `${ue5} ${G4} ${this._config.fontSize * this._config.devicePixelRatio}px ${this._config.fontFamily}`, this._tmpCtx.textBaseline = St3;
      let Se2 = a.length === 1 && Rt2(a.charCodeAt(0)), ce4 = a.length === 1 && fn(a.charCodeAt(0)), we3 = this._getForegroundColor(t, y, E, n, W3, S2, h2, f, d, Dt2(a.charCodeAt(0)));
      this._tmpCtx.fillStyle = we3.css;
      let A3 = ce4 ? 0 : rt3 * 2, se3 = false;
      this._config.customGlyphs !== false && (se3 = yn2(this._tmpCtx, a, A3, A3, this._config.deviceCellWidth, this._config.deviceCellHeight, this._config.fontSize, this._config.devicePixelRatio));
      let v3 = !Se2, p;
      if (typeof e == "number" ? p = this._unicodeService.wcwidth(e) : p = this._unicodeService.getStringCellWidth(e), L2) {
        this._tmpCtx.save();
        let x = Math.max(1, Math.floor(this._config.fontSize * this._config.devicePixelRatio / 15)), R3 = x % 2 === 1 ? 0.5 : 0;
        if (this._tmpCtx.lineWidth = x, this._workAttributeData.isUnderlineColorDefault()) this._tmpCtx.strokeStyle = this._tmpCtx.fillStyle;
        else if (this._workAttributeData.isUnderlineColorRGB()) v3 = false, this._tmpCtx.strokeStyle = `rgb(${he4.toColorRGB(this._workAttributeData.getUnderlineColor()).join(",")})`;
        else {
          v3 = false;
          let ie5 = this._workAttributeData.getUnderlineColor();
          this._config.drawBoldTextInBrightColors && this._workAttributeData.isBold() && ie5 < 8 && (ie5 += 8), this._tmpCtx.strokeStyle = this._getColorFromAnsiIndex(ie5).css;
        }
        this._tmpCtx.beginPath();
        let $4 = A3, P5 = Math.ceil(A3 + this._config.deviceCharHeight) - R3 - (o2 ? x * 2 : 0), de4 = P5 + x, Re4 = P5 + x * 2, oe = this._workAttributeData.getUnderlineVariantOffset();
        for (let ie5 = 0; ie5 < p; ie5++) {
          this._tmpCtx.save();
          let N4 = $4 + ie5 * this._config.deviceCellWidth, ne4 = $4 + (ie5 + 1) * this._config.deviceCellWidth, di = N4 + this._config.deviceCellWidth / 2;
          switch (this._workAttributeData.extended.underlineStyle) {
            case 2:
              this._tmpCtx.moveTo(N4, P5), this._tmpCtx.lineTo(ne4, P5), this._tmpCtx.moveTo(N4, Re4), this._tmpCtx.lineTo(ne4, Re4);
              break;
            case 3:
              let ft3 = x <= 1 ? Re4 : Math.ceil(A3 + this._config.deviceCharHeight - x / 2) - R3, mt3 = x <= 1 ? P5 : Math.ceil(A3 + this._config.deviceCharHeight + x / 2) - R3, qi = new Path2D();
              qi.rect(N4, P5, this._config.deviceCellWidth, Re4 - P5), this._tmpCtx.clip(qi), this._tmpCtx.moveTo(N4 - this._config.deviceCellWidth / 2, de4), this._tmpCtx.bezierCurveTo(N4 - this._config.deviceCellWidth / 2, mt3, N4, mt3, N4, de4), this._tmpCtx.bezierCurveTo(N4, ft3, di, ft3, di, de4), this._tmpCtx.bezierCurveTo(di, mt3, ne4, mt3, ne4, de4), this._tmpCtx.bezierCurveTo(ne4, ft3, ne4 + this._config.deviceCellWidth / 2, ft3, ne4 + this._config.deviceCellWidth / 2, de4);
              break;
            case 4:
              let _t2 = oe === 0 ? 0 : oe >= x ? x * 2 - oe : x - oe;
              !(oe >= x) === false || _t2 === 0 ? (this._tmpCtx.setLineDash([Math.round(x), Math.round(x)]), this._tmpCtx.moveTo(N4 + _t2, P5), this._tmpCtx.lineTo(ne4, P5)) : (this._tmpCtx.setLineDash([Math.round(x), Math.round(x)]), this._tmpCtx.moveTo(N4, P5), this._tmpCtx.lineTo(N4 + _t2, P5), this._tmpCtx.moveTo(N4 + _t2 + x, P5), this._tmpCtx.lineTo(ne4, P5)), oe = bn(ne4 - N4, x, oe);
              break;
            case 5:
              let Er = 0.6, yr = 0.3, hi = ne4 - N4, ji = Math.floor(Er * hi), Xi = Math.floor(yr * hi), Ir = hi - ji - Xi;
              this._tmpCtx.setLineDash([ji, Xi, Ir]), this._tmpCtx.moveTo(N4, P5), this._tmpCtx.lineTo(ne4, P5);
              break;
            case 1:
            default:
              this._tmpCtx.moveTo(N4, P5), this._tmpCtx.lineTo(ne4, P5);
              break;
          }
          this._tmpCtx.stroke(), this._tmpCtx.restore();
        }
        if (this._tmpCtx.restore(), !se3 && this._config.fontSize >= 12 && !this._config.allowTransparency && a !== " ") {
          this._tmpCtx.save(), this._tmpCtx.textBaseline = "alphabetic";
          let ie5 = this._tmpCtx.measureText(a);
          if (this._tmpCtx.restore(), "actualBoundingBoxDescent" in ie5 && ie5.actualBoundingBoxDescent > 0) {
            this._tmpCtx.save();
            let N4 = new Path2D();
            N4.rect($4, P5 - Math.ceil(x / 2), this._config.deviceCellWidth * p, Re4 - P5 + Math.ceil(x / 2)), this._tmpCtx.clip(N4), this._tmpCtx.lineWidth = this._config.devicePixelRatio * 3, this._tmpCtx.strokeStyle = w4.css, this._tmpCtx.strokeText(a, A3, A3 + this._config.deviceCharHeight), this._tmpCtx.restore();
          }
        }
      }
      if (q3) {
        let x = Math.max(1, Math.floor(this._config.fontSize * this._config.devicePixelRatio / 15)), R3 = x % 2 === 1 ? 0.5 : 0;
        this._tmpCtx.lineWidth = x, this._tmpCtx.strokeStyle = this._tmpCtx.fillStyle, this._tmpCtx.beginPath(), this._tmpCtx.moveTo(A3, A3 + R3), this._tmpCtx.lineTo(A3 + this._config.deviceCharWidth * p, A3 + R3), this._tmpCtx.stroke();
      }
      if (se3 || this._tmpCtx.fillText(a, A3, A3 + this._config.deviceCharHeight), a === "_" && !this._config.allowTransparency) {
        let x = Di(this._tmpCtx.getImageData(A3, A3, this._config.deviceCellWidth, this._config.deviceCellHeight), w4, we3, v3);
        if (x) for (let R3 = 1; R3 <= 5 && (this._tmpCtx.save(), this._tmpCtx.fillStyle = w4.css, this._tmpCtx.fillRect(0, 0, this._tmpCanvas.width, this._tmpCanvas.height), this._tmpCtx.restore(), this._tmpCtx.fillText(a, A3, A3 + this._config.deviceCharHeight - R3), x = Di(this._tmpCtx.getImageData(A3, A3, this._config.deviceCellWidth, this._config.deviceCellHeight), w4, we3, v3), !!x); R3++) ;
      }
      if (M6) {
        let x = Math.max(1, Math.floor(this._config.fontSize * this._config.devicePixelRatio / 10)), R3 = this._tmpCtx.lineWidth % 2 === 1 ? 0.5 : 0;
        this._tmpCtx.lineWidth = x, this._tmpCtx.strokeStyle = this._tmpCtx.fillStyle, this._tmpCtx.beginPath(), this._tmpCtx.moveTo(A3, A3 + Math.floor(this._config.deviceCharHeight / 2) - R3), this._tmpCtx.lineTo(A3 + this._config.deviceCharWidth * p, A3 + Math.floor(this._config.deviceCharHeight / 2) - R3), this._tmpCtx.stroke();
      }
      this._tmpCtx.restore();
      let g2 = this._tmpCtx.getImageData(0, 0, this._tmpCanvas.width, this._tmpCanvas.height), b;
      if (this._config.allowTransparency ? b = Jr(g2) : b = Di(g2, w4, we3, v3), b) return An;
      let m = this._findGlyphBoundingBox(g2, this._workBoundingBox, l2, ce4, se3, A3), _4, T2;
      for (; ; ) {
        if (this._activePages.length === 0) {
          let x = this._createNewPage();
          _4 = x, T2 = x.currentRow, T2.height = m.size.y;
          break;
        }
        _4 = this._activePages[this._activePages.length - 1], T2 = _4.currentRow;
        for (let x of this._activePages) m.size.y <= x.currentRow.height && (_4 = x, T2 = x.currentRow);
        for (let x = this._activePages.length - 1; x >= 0; x--) for (let R3 of this._activePages[x].fixedRows) R3.height <= T2.height && m.size.y <= R3.height && (_4 = this._activePages[x], T2 = R3);
        if (m.size.x > this._textureSize) {
          this._overflowSizePage || (this._overflowSizePage = new ot4(this._document, this._config.deviceMaxTextureSize), this.pages.push(this._overflowSizePage), this._requestClearModel = true, this._onAddTextureAtlasCanvas.fire(this._overflowSizePage.canvas)), _4 = this._overflowSizePage, T2 = this._overflowSizePage.currentRow, T2.x + m.size.x >= _4.canvas.width && (T2.x = 0, T2.y += T2.height, T2.height = 0);
          break;
        }
        if (T2.y + m.size.y >= _4.canvas.height || T2.height > m.size.y + 2) {
          let x = false;
          if (_4.currentRow.y + _4.currentRow.height + m.size.y >= _4.canvas.height) {
            let R3;
            for (let $4 of this._activePages) if ($4.currentRow.y + $4.currentRow.height + m.size.y < $4.canvas.height) {
              R3 = $4;
              break;
            }
            if (R3) _4 = R3;
            else if (i6.maxAtlasPages && this._pages.length >= i6.maxAtlasPages && T2.y + m.size.y <= _4.canvas.height && T2.height >= m.size.y && T2.x + m.size.x <= _4.canvas.width) x = true;
            else {
              let $4 = this._createNewPage();
              _4 = $4, T2 = $4.currentRow, T2.height = m.size.y, x = true;
            }
          }
          x || (_4.currentRow.height > 0 && _4.fixedRows.push(_4.currentRow), T2 = { x: 0, y: _4.currentRow.y + _4.currentRow.height, height: m.size.y }, _4.fixedRows.push(T2), _4.currentRow = { x: 0, y: T2.y + T2.height, height: 0 });
        }
        if (T2.x + m.size.x <= _4.canvas.width) break;
        T2 === _4.currentRow ? (T2.x = 0, T2.y += T2.height, T2.height = 0) : _4.fixedRows.splice(_4.fixedRows.indexOf(T2), 1);
      }
      return m.texturePage = this._pages.indexOf(_4), m.texturePosition.x = T2.x, m.texturePosition.y = T2.y, m.texturePositionClipSpace.x = T2.x / _4.canvas.width, m.texturePositionClipSpace.y = T2.y / _4.canvas.height, m.sizeClipSpace.x /= _4.canvas.width, m.sizeClipSpace.y /= _4.canvas.height, T2.height = Math.max(T2.height, m.size.y), T2.x += m.size.x, _4.ctx.putImageData(g2, m.texturePosition.x - this._workBoundingBox.left, m.texturePosition.y - this._workBoundingBox.top, this._workBoundingBox.left, this._workBoundingBox.top, m.size.x, m.size.y), _4.addGlyph(m), _4.version++, m;
    }
    _findGlyphBoundingBox(e, t, n, s, o2, r11) {
      t.top = 0;
      let a = s ? this._config.deviceCellHeight : this._tmpCanvas.height, l2 = s ? this._config.deviceCellWidth : n, u = false;
      for (let c = 0; c < a; c++) {
        for (let d = 0; d < l2; d++) {
          let h2 = c * this._tmpCanvas.width * 4 + d * 4 + 3;
          if (e.data[h2] !== 0) {
            t.top = c, u = true;
            break;
          }
        }
        if (u) break;
      }
      t.left = 0, u = false;
      for (let c = 0; c < r11 + l2; c++) {
        for (let d = 0; d < a; d++) {
          let h2 = d * this._tmpCanvas.width * 4 + c * 4 + 3;
          if (e.data[h2] !== 0) {
            t.left = c, u = true;
            break;
          }
        }
        if (u) break;
      }
      t.right = l2, u = false;
      for (let c = r11 + l2 - 1; c >= r11; c--) {
        for (let d = 0; d < a; d++) {
          let h2 = d * this._tmpCanvas.width * 4 + c * 4 + 3;
          if (e.data[h2] !== 0) {
            t.right = c, u = true;
            break;
          }
        }
        if (u) break;
      }
      t.bottom = a, u = false;
      for (let c = a - 1; c >= 0; c--) {
        for (let d = 0; d < l2; d++) {
          let h2 = c * this._tmpCanvas.width * 4 + d * 4 + 3;
          if (e.data[h2] !== 0) {
            t.bottom = c, u = true;
            break;
          }
        }
        if (u) break;
      }
      return { texturePage: 0, texturePosition: { x: 0, y: 0 }, texturePositionClipSpace: { x: 0, y: 0 }, size: { x: t.right - t.left + 1, y: t.bottom - t.top + 1 }, sizeClipSpace: { x: t.right - t.left + 1, y: t.bottom - t.top + 1 }, offset: { x: -t.left + r11 + (s || o2 ? Math.floor((this._config.deviceCellWidth - this._config.deviceCharWidth) / 2) : 0), y: -t.top + r11 + (s || o2 ? this._config.lineHeight === 1 ? 0 : Math.round((this._config.deviceCellHeight - this._config.deviceCharHeight) / 2) : 0) } };
    }
  };
  var ot4 = class {
    constructor(e, t, n) {
      this._usedPixels = 0;
      this._glyphs = [];
      this.version = 0;
      this.currentRow = { x: 0, y: 0, height: 0 };
      this.fixedRows = [];
      if (n) for (let s of n) this._glyphs.push(...s.glyphs), this._usedPixels += s._usedPixels;
      this.canvas = Sn(e, t, t), this.ctx = F3(this.canvas.getContext("2d", { alpha: true }));
    }
    get percentageUsed() {
      return this._usedPixels / (this.canvas.width * this.canvas.height);
    }
    get glyphs() {
      return this._glyphs;
    }
    addGlyph(e) {
      this._glyphs.push(e), this._usedPixels += e.size.x * e.size.y;
    }
    clear() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height), this.currentRow.x = 0, this.currentRow.y = 0, this.currentRow.height = 0, this.fixedRows.length = 0, this.version++;
    }
  };
  function Di(i8, e, t, n) {
    let s = e.rgba >>> 24, o2 = e.rgba >>> 16 & 255, r11 = e.rgba >>> 8 & 255, a = t.rgba >>> 24, l2 = t.rgba >>> 16 & 255, u = t.rgba >>> 8 & 255, c = Math.floor((Math.abs(s - a) + Math.abs(o2 - l2) + Math.abs(r11 - u)) / 12), d = true;
    for (let h2 = 0; h2 < i8.data.length; h2 += 4) i8.data[h2] === s && i8.data[h2 + 1] === o2 && i8.data[h2 + 2] === r11 || n && Math.abs(i8.data[h2] - s) + Math.abs(i8.data[h2 + 1] - o2) + Math.abs(i8.data[h2 + 2] - r11) < c ? i8.data[h2 + 3] = 0 : d = false;
    return d;
  }
  function Jr(i8) {
    for (let e = 0; e < i8.data.length; e += 4) if (i8.data[e + 3] > 0) return false;
    return true;
  }
  function Sn(i8, e, t) {
    let n = i8.createElement("canvas");
    return n.width = e, n.height = t, n;
  }
  function On(i8, e, t, n, s, o2, r11, a) {
    let l2 = { foreground: o2.foreground, background: o2.background, cursor: Z4, cursorAccent: Z4, selectionForeground: Z4, selectionBackgroundTransparent: Z4, selectionBackgroundOpaque: Z4, selectionInactiveBackgroundTransparent: Z4, selectionInactiveBackgroundOpaque: Z4, overviewRulerBorder: Z4, scrollbarSliderBackground: Z4, scrollbarSliderHoverBackground: Z4, scrollbarSliderActiveBackground: Z4, ansi: o2.ansi.slice(), contrastCache: o2.contrastCache, halfContrastCache: o2.halfContrastCache };
    return { customGlyphs: s.customGlyphs, devicePixelRatio: r11, deviceMaxTextureSize: a, letterSpacing: s.letterSpacing, lineHeight: s.lineHeight, deviceCellWidth: i8, deviceCellHeight: e, deviceCharWidth: t, deviceCharHeight: n, fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight, fontWeightBold: s.fontWeightBold, allowTransparency: s.allowTransparency, drawBoldTextInBrightColors: s.drawBoldTextInBrightColors, minimumContrastRatio: s.minimumContrastRatio, colors: l2 };
  }
  function Mi(i8, e) {
    for (let t = 0; t < i8.colors.ansi.length; t++) if (i8.colors.ansi[t].rgba !== e.colors.ansi[t].rgba) return false;
    return i8.devicePixelRatio === e.devicePixelRatio && i8.customGlyphs === e.customGlyphs && i8.lineHeight === e.lineHeight && i8.letterSpacing === e.letterSpacing && i8.fontFamily === e.fontFamily && i8.fontSize === e.fontSize && i8.fontWeight === e.fontWeight && i8.fontWeightBold === e.fontWeightBold && i8.allowTransparency === e.allowTransparency && i8.deviceCharWidth === e.deviceCharWidth && i8.deviceCharHeight === e.deviceCharHeight && i8.drawBoldTextInBrightColors === e.drawBoldTextInBrightColors && i8.minimumContrastRatio === e.minimumContrastRatio && i8.colors.foreground.rgba === e.colors.foreground.rgba && i8.colors.background.rgba === e.colors.background.rgba;
  }
  function Fn(i8) {
    return (i8 & 50331648) === 16777216 || (i8 & 50331648) === 33554432;
  }
  var le3 = [];
  function Nt3(i8, e, t, n, s, o2, r11, a, l2) {
    let u = On(n, s, o2, r11, e, t, a, l2);
    for (let h2 = 0; h2 < le3.length; h2++) {
      let f = le3[h2], I2 = f.ownedBy.indexOf(i8);
      if (I2 >= 0) {
        if (Mi(f.config, u)) return f.atlas;
        f.ownedBy.length === 1 ? (f.atlas.dispose(), le3.splice(h2, 1)) : f.ownedBy.splice(I2, 1);
        break;
      }
    }
    for (let h2 = 0; h2 < le3.length; h2++) {
      let f = le3[h2];
      if (Mi(f.config, u)) return f.ownedBy.push(i8), f.atlas;
    }
    let c = i8._core, d = { atlas: new ae2(document, u, c.unicodeService), config: u, ownedBy: [i8] };
    return le3.push(d), d.atlas;
  }
  function Ai(i8) {
    for (let e = 0; e < le3.length; e++) {
      let t = le3[e].ownedBy.indexOf(i8);
      if (t !== -1) {
        le3[e].ownedBy.length === 1 ? (le3[e].atlas.dispose(), le3.splice(e, 1)) : le3[e].ownedBy.splice(t, 1);
        break;
      }
    }
  }
  var Ut = 600;
  var Ht2 = class {
    constructor(e, t) {
      this._renderCallback = e;
      this._coreBrowserService = t;
      this.isCursorVisible = true, this._coreBrowserService.isFocused && this._restartInterval();
    }
    get isPaused() {
      return !(this._blinkStartTimeout || this._blinkInterval);
    }
    dispose() {
      this._blinkInterval && (this._coreBrowserService.window.clearInterval(this._blinkInterval), this._blinkInterval = void 0), this._blinkStartTimeout && (this._coreBrowserService.window.clearTimeout(this._blinkStartTimeout), this._blinkStartTimeout = void 0), this._animationFrame && (this._coreBrowserService.window.cancelAnimationFrame(this._animationFrame), this._animationFrame = void 0);
    }
    restartBlinkAnimation() {
      this.isPaused || (this._animationTimeRestarted = Date.now(), this.isCursorVisible = true, this._animationFrame || (this._animationFrame = this._coreBrowserService.window.requestAnimationFrame(() => {
        this._renderCallback(), this._animationFrame = void 0;
      })));
    }
    _restartInterval(e = Ut) {
      this._blinkInterval && (this._coreBrowserService.window.clearInterval(this._blinkInterval), this._blinkInterval = void 0), this._blinkStartTimeout = this._coreBrowserService.window.setTimeout(() => {
        if (this._animationTimeRestarted) {
          let t = Ut - (Date.now() - this._animationTimeRestarted);
          if (this._animationTimeRestarted = void 0, t > 0) {
            this._restartInterval(t);
            return;
          }
        }
        this.isCursorVisible = false, this._animationFrame = this._coreBrowserService.window.requestAnimationFrame(() => {
          this._renderCallback(), this._animationFrame = void 0;
        }), this._blinkInterval = this._coreBrowserService.window.setInterval(() => {
          if (this._animationTimeRestarted) {
            let t = Ut - (Date.now() - this._animationTimeRestarted);
            this._animationTimeRestarted = void 0, this._restartInterval(t);
            return;
          }
          this.isCursorVisible = !this.isCursorVisible, this._animationFrame = this._coreBrowserService.window.requestAnimationFrame(() => {
            this._renderCallback(), this._animationFrame = void 0;
          });
        }, Ut);
      }, e);
    }
    pause() {
      this.isCursorVisible = true, this._blinkInterval && (this._coreBrowserService.window.clearInterval(this._blinkInterval), this._blinkInterval = void 0), this._blinkStartTimeout && (this._coreBrowserService.window.clearTimeout(this._blinkStartTimeout), this._blinkStartTimeout = void 0), this._animationFrame && (this._coreBrowserService.window.cancelAnimationFrame(this._animationFrame), this._animationFrame = void 0);
    }
    resume() {
      this.pause(), this._animationTimeRestarted = void 0, this._restartInterval(), this.restartBlinkAnimation();
    }
  };
  function Si(i8, e, t) {
    let n = new e.ResizeObserver((s) => {
      let o2 = s.find((l2) => l2.target === i8);
      if (!o2) return;
      if (!("devicePixelContentBoxSize" in o2)) {
        n?.disconnect(), n = void 0;
        return;
      }
      let r11 = o2.devicePixelContentBoxSize[0].inlineSize, a = o2.devicePixelContentBoxSize[0].blockSize;
      r11 > 0 && a > 0 && t(r11, a);
    });
    try {
      n.observe(i8, { box: ["device-pixel-content-box"] });
    } catch {
      n.disconnect(), n = void 0;
    }
    return O3(() => n?.disconnect());
  }
  function kn(i8) {
    return i8 > 65535 ? (i8 -= 65536, String.fromCharCode((i8 >> 10) + 55296) + String.fromCharCode(i8 % 1024 + 56320)) : String.fromCharCode(i8);
  }
  var at4 = class i7 extends he4 {
    constructor() {
      super(...arguments);
      this.content = 0;
      this.fg = 0;
      this.bg = 0;
      this.extended = new it4();
      this.combinedData = "";
    }
    static fromCharData(t) {
      let n = new i7();
      return n.setFromCharData(t), n;
    }
    isCombined() {
      return this.content & 2097152;
    }
    getWidth() {
      return this.content >> 22;
    }
    getChars() {
      return this.content & 2097152 ? this.combinedData : this.content & 2097151 ? kn(this.content & 2097151) : "";
    }
    getCode() {
      return this.isCombined() ? this.combinedData.charCodeAt(this.combinedData.length - 1) : this.content & 2097151;
    }
    setFromCharData(t) {
      this.fg = t[0], this.bg = 0;
      let n = false;
      if (t[1].length > 2) n = true;
      else if (t[1].length === 2) {
        let s = t[1].charCodeAt(0);
        if (55296 <= s && s <= 56319) {
          let o2 = t[1].charCodeAt(1);
          56320 <= o2 && o2 <= 57343 ? this.content = (s - 55296) * 1024 + o2 - 56320 + 65536 | t[2] << 22 : n = true;
        } else n = true;
      } else this.content = t[1].charCodeAt(0) | t[2] << 22;
      n && (this.combinedData = t[1], this.content = 2097152 | t[2] << 22);
    }
    getAsCharData() {
      return [this.fg, this.getChars(), this.getWidth(), this.getCode()];
    }
  };
  var Gt = new Float32Array([2, 0, 0, 0, 0, -2, 0, 0, 0, 0, 1, 0, -1, 1, 0, 1]);
  function $t(i8, e, t) {
    let n = F3(i8.createProgram());
    if (i8.attachShader(n, F3(Pn(i8, i8.VERTEX_SHADER, e))), i8.attachShader(n, F3(Pn(i8, i8.FRAGMENT_SHADER, t))), i8.linkProgram(n), i8.getProgramParameter(n, i8.LINK_STATUS)) return n;
    console.error(i8.getProgramInfoLog(n)), i8.deleteProgram(n);
  }
  function Pn(i8, e, t) {
    let n = F3(i8.createShader(e));
    if (i8.shaderSource(n, t), i8.compileShader(n), i8.getShaderParameter(n, i8.COMPILE_STATUS)) return n;
    console.error(i8.getShaderInfoLog(n)), i8.deleteShader(n);
  }
  function Bn(i8, e) {
    let t = Math.min(i8.length * 2, e), n = new Float32Array(t);
    for (let s = 0; s < i8.length; s++) n[s] = i8[s];
    return n;
  }
  var Wt2 = class {
    constructor(e) {
      this.texture = e, this.version = -1;
    }
  };
  var is = `#version 300 es
layout (location = 0) in vec2 a_unitquad;
layout (location = 1) in vec2 a_cellpos;
layout (location = 2) in vec2 a_offset;
layout (location = 3) in vec2 a_size;
layout (location = 4) in float a_texpage;
layout (location = 5) in vec2 a_texcoord;
layout (location = 6) in vec2 a_texsize;

uniform mat4 u_projection;
uniform vec2 u_resolution;

out vec2 v_texcoord;
flat out int v_texpage;

void main() {
  vec2 zeroToOne = (a_offset / u_resolution) + a_cellpos + (a_unitquad * a_size);
  gl_Position = u_projection * vec4(zeroToOne, 0.0, 1.0);
  v_texpage = int(a_texpage);
  v_texcoord = a_texcoord + a_unitquad * a_texsize;
}`;
  function ns(i8) {
    let e = "";
    for (let t = 1; t < i8; t++) e += ` else if (v_texpage == ${t}) { outColor = texture(u_texture[${t}], v_texcoord); }`;
    return `#version 300 es
precision lowp float;

in vec2 v_texcoord;
flat in int v_texpage;

uniform sampler2D u_texture[${i8}];

out vec4 outColor;

void main() {
  if (v_texpage == 0) {
    outColor = texture(u_texture[0], v_texcoord);
  } ${e}
}`;
  }
  var De4 = 11;
  var Ve2 = De4 * Float32Array.BYTES_PER_ELEMENT;
  var rs = 2;
  var H4 = 0;
  var k3;
  var Fi = 0;
  var lt3 = 0;
  var Kt = class extends B3 {
    constructor(t, n, s, o2) {
      super();
      this._terminal = t;
      this._gl = n;
      this._dimensions = s;
      this._optionsService = o2;
      this._activeBuffer = 0;
      this._vertices = { count: 0, attributes: new Float32Array(0), attributesBuffers: [new Float32Array(0), new Float32Array(0)] };
      let r11 = this._gl;
      ae2.maxAtlasPages === void 0 && (ae2.maxAtlasPages = Math.min(32, F3(r11.getParameter(r11.MAX_TEXTURE_IMAGE_UNITS))), ae2.maxTextureSize = F3(r11.getParameter(r11.MAX_TEXTURE_SIZE))), this._program = F3($t(r11, is, ns(ae2.maxAtlasPages))), this._register(O3(() => r11.deleteProgram(this._program))), this._projectionLocation = F3(r11.getUniformLocation(this._program, "u_projection")), this._resolutionLocation = F3(r11.getUniformLocation(this._program, "u_resolution")), this._textureLocation = F3(r11.getUniformLocation(this._program, "u_texture")), this._vertexArrayObject = r11.createVertexArray(), r11.bindVertexArray(this._vertexArrayObject);
      let a = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), l2 = r11.createBuffer();
      this._register(O3(() => r11.deleteBuffer(l2))), r11.bindBuffer(r11.ARRAY_BUFFER, l2), r11.bufferData(r11.ARRAY_BUFFER, a, r11.STATIC_DRAW), r11.enableVertexAttribArray(0), r11.vertexAttribPointer(0, 2, this._gl.FLOAT, false, 0, 0);
      let u = new Uint8Array([0, 1, 2, 3]), c = r11.createBuffer();
      this._register(O3(() => r11.deleteBuffer(c))), r11.bindBuffer(r11.ELEMENT_ARRAY_BUFFER, c), r11.bufferData(r11.ELEMENT_ARRAY_BUFFER, u, r11.STATIC_DRAW), this._attributesBuffer = F3(r11.createBuffer()), this._register(O3(() => r11.deleteBuffer(this._attributesBuffer))), r11.bindBuffer(r11.ARRAY_BUFFER, this._attributesBuffer), r11.enableVertexAttribArray(2), r11.vertexAttribPointer(2, 2, r11.FLOAT, false, Ve2, 0), r11.vertexAttribDivisor(2, 1), r11.enableVertexAttribArray(3), r11.vertexAttribPointer(3, 2, r11.FLOAT, false, Ve2, 2 * Float32Array.BYTES_PER_ELEMENT), r11.vertexAttribDivisor(3, 1), r11.enableVertexAttribArray(4), r11.vertexAttribPointer(4, 1, r11.FLOAT, false, Ve2, 4 * Float32Array.BYTES_PER_ELEMENT), r11.vertexAttribDivisor(4, 1), r11.enableVertexAttribArray(5), r11.vertexAttribPointer(5, 2, r11.FLOAT, false, Ve2, 5 * Float32Array.BYTES_PER_ELEMENT), r11.vertexAttribDivisor(5, 1), r11.enableVertexAttribArray(6), r11.vertexAttribPointer(6, 2, r11.FLOAT, false, Ve2, 7 * Float32Array.BYTES_PER_ELEMENT), r11.vertexAttribDivisor(6, 1), r11.enableVertexAttribArray(1), r11.vertexAttribPointer(1, 2, r11.FLOAT, false, Ve2, 9 * Float32Array.BYTES_PER_ELEMENT), r11.vertexAttribDivisor(1, 1), r11.useProgram(this._program);
      let d = new Int32Array(ae2.maxAtlasPages);
      for (let h2 = 0; h2 < ae2.maxAtlasPages; h2++) d[h2] = h2;
      r11.uniform1iv(this._textureLocation, d), r11.uniformMatrix4fv(this._projectionLocation, false, Gt), this._atlasTextures = [];
      for (let h2 = 0; h2 < ae2.maxAtlasPages; h2++) {
        let f = new Wt2(F3(r11.createTexture()));
        this._register(O3(() => r11.deleteTexture(f.texture))), r11.activeTexture(r11.TEXTURE0 + h2), r11.bindTexture(r11.TEXTURE_2D, f.texture), r11.texParameteri(r11.TEXTURE_2D, r11.TEXTURE_WRAP_S, r11.CLAMP_TO_EDGE), r11.texParameteri(r11.TEXTURE_2D, r11.TEXTURE_WRAP_T, r11.CLAMP_TO_EDGE), r11.texImage2D(r11.TEXTURE_2D, 0, r11.RGBA, 1, 1, 0, r11.RGBA, r11.UNSIGNED_BYTE, new Uint8Array([255, 0, 0, 255])), this._atlasTextures[h2] = f;
      }
      r11.enable(r11.BLEND), r11.blendFunc(r11.SRC_ALPHA, r11.ONE_MINUS_SRC_ALPHA), this.handleResize();
    }
    beginFrame() {
      return this._atlas ? this._atlas.beginFrame() : true;
    }
    updateCell(t, n, s, o2, r11, a, l2, u, c) {
      this._updateCell(this._vertices.attributes, t, n, s, o2, r11, a, l2, u, c);
    }
    _updateCell(t, n, s, o2, r11, a, l2, u, c, d) {
      if (H4 = (s * this._terminal.cols + n) * De4, o2 === 0 || o2 === void 0) {
        t.fill(0, H4, H4 + De4 - 1 - rs);
        return;
      }
      this._atlas && (u && u.length > 1 ? k3 = this._atlas.getRasterizedGlyphCombinedChar(u, r11, a, l2, false, this._terminal.element) : k3 = this._atlas.getRasterizedGlyph(o2, r11, a, l2, false, this._terminal.element), Fi = Math.floor((this._dimensions.device.cell.width - this._dimensions.device.char.width) / 2), r11 !== d && k3.offset.x > Fi ? (lt3 = k3.offset.x - Fi, t[H4] = -(k3.offset.x - lt3) + this._dimensions.device.char.left, t[H4 + 1] = -k3.offset.y + this._dimensions.device.char.top, t[H4 + 2] = (k3.size.x - lt3) / this._dimensions.device.canvas.width, t[H4 + 3] = k3.size.y / this._dimensions.device.canvas.height, t[H4 + 4] = k3.texturePage, t[H4 + 5] = k3.texturePositionClipSpace.x + lt3 / this._atlas.pages[k3.texturePage].canvas.width, t[H4 + 6] = k3.texturePositionClipSpace.y, t[H4 + 7] = k3.sizeClipSpace.x - lt3 / this._atlas.pages[k3.texturePage].canvas.width, t[H4 + 8] = k3.sizeClipSpace.y) : (t[H4] = -k3.offset.x + this._dimensions.device.char.left, t[H4 + 1] = -k3.offset.y + this._dimensions.device.char.top, t[H4 + 2] = k3.size.x / this._dimensions.device.canvas.width, t[H4 + 3] = k3.size.y / this._dimensions.device.canvas.height, t[H4 + 4] = k3.texturePage, t[H4 + 5] = k3.texturePositionClipSpace.x, t[H4 + 6] = k3.texturePositionClipSpace.y, t[H4 + 7] = k3.sizeClipSpace.x, t[H4 + 8] = k3.sizeClipSpace.y), this._optionsService.rawOptions.rescaleOverlappingGlyphs && mn(o2, c, k3.size.x, this._dimensions.device.cell.width) && (t[H4 + 2] = (this._dimensions.device.cell.width - 1) / this._dimensions.device.canvas.width));
    }
    clear() {
      let t = this._terminal, n = t.cols * t.rows * De4;
      this._vertices.count !== n ? this._vertices.attributes = new Float32Array(n) : this._vertices.attributes.fill(0);
      let s = 0;
      for (; s < this._vertices.attributesBuffers.length; s++) this._vertices.count !== n ? this._vertices.attributesBuffers[s] = new Float32Array(n) : this._vertices.attributesBuffers[s].fill(0);
      this._vertices.count = n, s = 0;
      for (let o2 = 0; o2 < t.rows; o2++) for (let r11 = 0; r11 < t.cols; r11++) this._vertices.attributes[s + 9] = r11 / t.cols, this._vertices.attributes[s + 10] = o2 / t.rows, s += De4;
    }
    handleResize() {
      let t = this._gl;
      t.useProgram(this._program), t.viewport(0, 0, t.canvas.width, t.canvas.height), t.uniform2f(this._resolutionLocation, t.canvas.width, t.canvas.height), this.clear();
    }
    render(t) {
      if (!this._atlas) return;
      let n = this._gl;
      n.useProgram(this._program), n.bindVertexArray(this._vertexArrayObject), this._activeBuffer = (this._activeBuffer + 1) % 2;
      let s = this._vertices.attributesBuffers[this._activeBuffer], o2 = 0;
      for (let r11 = 0; r11 < t.lineLengths.length; r11++) {
        let a = r11 * this._terminal.cols * De4, l2 = this._vertices.attributes.subarray(a, a + t.lineLengths[r11] * De4);
        s.set(l2, o2), o2 += l2.length;
      }
      n.bindBuffer(n.ARRAY_BUFFER, this._attributesBuffer), n.bufferData(n.ARRAY_BUFFER, s.subarray(0, o2), n.STREAM_DRAW);
      for (let r11 = 0; r11 < this._atlas.pages.length; r11++) this._atlas.pages[r11].version !== this._atlasTextures[r11].version && this._bindAtlasPageTexture(n, this._atlas, r11);
      n.drawElementsInstanced(n.TRIANGLE_STRIP, 4, n.UNSIGNED_BYTE, 0, o2 / De4);
    }
    setAtlas(t) {
      this._atlas = t;
      for (let n of this._atlasTextures) n.version = -1;
    }
    _bindAtlasPageTexture(t, n, s) {
      t.activeTexture(t.TEXTURE0 + s), t.bindTexture(t.TEXTURE_2D, this._atlasTextures[s].texture), t.texParameteri(t.TEXTURE_2D, t.TEXTURE_WRAP_S, t.CLAMP_TO_EDGE), t.texParameteri(t.TEXTURE_2D, t.TEXTURE_WRAP_T, t.CLAMP_TO_EDGE), t.texImage2D(t.TEXTURE_2D, 0, t.RGBA, t.RGBA, t.UNSIGNED_BYTE, n.pages[s].canvas), t.generateMipmap(t.TEXTURE_2D), this._atlasTextures[s].version = n.pages[s].version;
    }
    setDimensions(t) {
      this._dimensions = t;
    }
  };
  var ki = class {
    constructor() {
      this.clear();
    }
    clear() {
      this.hasSelection = false, this.columnSelectMode = false, this.viewportStartRow = 0, this.viewportEndRow = 0, this.viewportCappedStartRow = 0, this.viewportCappedEndRow = 0, this.startCol = 0, this.endCol = 0, this.selectionStart = void 0, this.selectionEnd = void 0;
    }
    update(e, t, n, s = false) {
      if (this.selectionStart = t, this.selectionEnd = n, !t || !n || t[0] === n[0] && t[1] === n[1]) {
        this.clear();
        return;
      }
      let o2 = e.buffers.active.ydisp, r11 = t[1] - o2, a = n[1] - o2, l2 = Math.max(r11, 0), u = Math.min(a, e.rows - 1);
      if (l2 >= e.rows || u < 0) {
        this.clear();
        return;
      }
      this.hasSelection = true, this.columnSelectMode = s, this.viewportStartRow = r11, this.viewportEndRow = a, this.viewportCappedStartRow = l2, this.viewportCappedEndRow = u, this.startCol = t[0], this.endCol = n[0];
    }
    isCellSelected(e, t, n) {
      return this.hasSelection ? (n -= e.buffer.active.viewportY, this.columnSelectMode ? this.startCol <= this.endCol ? t >= this.startCol && n >= this.viewportCappedStartRow && t < this.endCol && n <= this.viewportCappedEndRow : t < this.startCol && n >= this.viewportCappedStartRow && t >= this.endCol && n <= this.viewportCappedEndRow : n > this.viewportStartRow && n < this.viewportEndRow || this.viewportStartRow === this.viewportEndRow && n === this.viewportStartRow && t >= this.startCol && t < this.endCol || this.viewportStartRow < this.viewportEndRow && n === this.viewportEndRow && t < this.endCol || this.viewportStartRow < this.viewportEndRow && n === this.viewportStartRow && t >= this.startCol) : false;
    }
  };
  function Nn() {
    return new ki();
  }
  var Ce2 = 4;
  var ze3 = 1;
  var qe4 = 2;
  var Ct3 = 3;
  var Un = 2147483648;
  var Vt = class {
    constructor() {
      this.cells = new Uint32Array(0), this.lineLengths = new Uint32Array(0), this.selection = Nn();
    }
    resize(e, t) {
      let n = e * t * Ce2;
      n !== this.cells.length && (this.cells = new Uint32Array(n), this.lineLengths = new Uint32Array(t));
    }
    clear() {
      this.cells.fill(0, 0), this.lineLengths.fill(0, 0);
    }
  };
  var ss = `#version 300 es
layout (location = 0) in vec2 a_position;
layout (location = 1) in vec2 a_size;
layout (location = 2) in vec4 a_color;
layout (location = 3) in vec2 a_unitquad;

uniform mat4 u_projection;

out vec4 v_color;

void main() {
  vec2 zeroToOne = a_position + (a_unitquad * a_size);
  gl_Position = u_projection * vec4(zeroToOne, 0.0, 1.0);
  v_color = a_color;
}`;
  var os = `#version 300 es
precision lowp float;

in vec4 v_color;

out vec4 outColor;

void main() {
  outColor = v_color;
}`;
  var Ee4 = 8;
  var Pi = Ee4 * Float32Array.BYTES_PER_ELEMENT;
  var as = 20 * Ee4;
  var zt = class {
    constructor() {
      this.attributes = new Float32Array(as), this.count = 0;
    }
  };
  var xe2 = 0;
  var Hn = 0;
  var Wn = 0;
  var Gn = 0;
  var $n = 0;
  var Kn = 0;
  var Vn = 0;
  var qt2 = class extends B3 {
    constructor(t, n, s, o2) {
      super();
      this._terminal = t;
      this._gl = n;
      this._dimensions = s;
      this._themeService = o2;
      this._vertices = new zt();
      this._verticesCursor = new zt();
      let r11 = this._gl;
      this._program = F3($t(r11, ss, os)), this._register(O3(() => r11.deleteProgram(this._program))), this._projectionLocation = F3(r11.getUniformLocation(this._program, "u_projection")), this._vertexArrayObject = r11.createVertexArray(), r11.bindVertexArray(this._vertexArrayObject);
      let a = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), l2 = r11.createBuffer();
      this._register(O3(() => r11.deleteBuffer(l2))), r11.bindBuffer(r11.ARRAY_BUFFER, l2), r11.bufferData(r11.ARRAY_BUFFER, a, r11.STATIC_DRAW), r11.enableVertexAttribArray(3), r11.vertexAttribPointer(3, 2, this._gl.FLOAT, false, 0, 0);
      let u = new Uint8Array([0, 1, 2, 3]), c = r11.createBuffer();
      this._register(O3(() => r11.deleteBuffer(c))), r11.bindBuffer(r11.ELEMENT_ARRAY_BUFFER, c), r11.bufferData(r11.ELEMENT_ARRAY_BUFFER, u, r11.STATIC_DRAW), this._attributesBuffer = F3(r11.createBuffer()), this._register(O3(() => r11.deleteBuffer(this._attributesBuffer))), r11.bindBuffer(r11.ARRAY_BUFFER, this._attributesBuffer), r11.enableVertexAttribArray(0), r11.vertexAttribPointer(0, 2, r11.FLOAT, false, Pi, 0), r11.vertexAttribDivisor(0, 1), r11.enableVertexAttribArray(1), r11.vertexAttribPointer(1, 2, r11.FLOAT, false, Pi, 2 * Float32Array.BYTES_PER_ELEMENT), r11.vertexAttribDivisor(1, 1), r11.enableVertexAttribArray(2), r11.vertexAttribPointer(2, 4, r11.FLOAT, false, Pi, 4 * Float32Array.BYTES_PER_ELEMENT), r11.vertexAttribDivisor(2, 1), this._updateCachedColors(o2.colors), this._register(this._themeService.onChangeColors((d) => {
        this._updateCachedColors(d), this._updateViewportRectangle();
      }));
    }
    renderBackgrounds() {
      this._renderVertices(this._vertices);
    }
    renderCursor() {
      this._renderVertices(this._verticesCursor);
    }
    _renderVertices(t) {
      let n = this._gl;
      n.useProgram(this._program), n.bindVertexArray(this._vertexArrayObject), n.uniformMatrix4fv(this._projectionLocation, false, Gt), n.bindBuffer(n.ARRAY_BUFFER, this._attributesBuffer), n.bufferData(n.ARRAY_BUFFER, t.attributes, n.DYNAMIC_DRAW), n.drawElementsInstanced(this._gl.TRIANGLE_STRIP, 4, n.UNSIGNED_BYTE, 0, t.count);
    }
    handleResize() {
      this._updateViewportRectangle();
    }
    setDimensions(t) {
      this._dimensions = t;
    }
    _updateCachedColors(t) {
      this._bgFloat = this._colorToFloat32Array(t.background), this._cursorFloat = this._colorToFloat32Array(t.cursor);
    }
    _updateViewportRectangle() {
      this._addRectangleFloat(this._vertices.attributes, 0, 0, 0, this._terminal.cols * this._dimensions.device.cell.width, this._terminal.rows * this._dimensions.device.cell.height, this._bgFloat);
    }
    updateBackgrounds(t) {
      let n = this._terminal, s = this._vertices, o2 = 1, r11, a, l2, u, c, d, h2, f, I2, L2, M6;
      for (r11 = 0; r11 < n.rows; r11++) {
        for (l2 = -1, u = 0, c = 0, d = false, a = 0; a < n.cols; a++) h2 = (r11 * n.cols + a) * Ce2, f = t.cells[h2 + ze3], I2 = t.cells[h2 + qe4], L2 = !!(I2 & 67108864), (f !== u || I2 !== c && (d || L2)) && ((u !== 0 || d && c !== 0) && (M6 = o2++ * Ee4, this._updateRectangle(s, M6, c, u, l2, a, r11)), l2 = a, u = f, c = I2, d = L2);
        (u !== 0 || d && c !== 0) && (M6 = o2++ * Ee4, this._updateRectangle(s, M6, c, u, l2, n.cols, r11));
      }
      s.count = o2;
    }
    updateCursor(t) {
      let n = this._verticesCursor, s = t.cursor;
      if (!s || s.style === "block") {
        n.count = 0;
        return;
      }
      let o2, r11 = 0;
      (s.style === "bar" || s.style === "outline") && (o2 = r11++ * Ee4, this._addRectangleFloat(n.attributes, o2, s.x * this._dimensions.device.cell.width, s.y * this._dimensions.device.cell.height, s.style === "bar" ? s.dpr * s.cursorWidth : s.dpr, this._dimensions.device.cell.height, this._cursorFloat)), (s.style === "underline" || s.style === "outline") && (o2 = r11++ * Ee4, this._addRectangleFloat(n.attributes, o2, s.x * this._dimensions.device.cell.width, (s.y + 1) * this._dimensions.device.cell.height - s.dpr, s.width * this._dimensions.device.cell.width, s.dpr, this._cursorFloat)), s.style === "outline" && (o2 = r11++ * Ee4, this._addRectangleFloat(n.attributes, o2, s.x * this._dimensions.device.cell.width, s.y * this._dimensions.device.cell.height, s.width * this._dimensions.device.cell.width, s.dpr, this._cursorFloat), o2 = r11++ * Ee4, this._addRectangleFloat(n.attributes, o2, (s.x + s.width) * this._dimensions.device.cell.width - s.dpr, s.y * this._dimensions.device.cell.height, s.dpr, this._dimensions.device.cell.height, this._cursorFloat)), n.count = r11;
    }
    _updateRectangle(t, n, s, o2, r11, a, l2) {
      if (s & 67108864) switch (s & 50331648) {
        case 16777216:
        case 33554432:
          xe2 = this._themeService.colors.ansi[s & 255].rgba;
          break;
        case 50331648:
          xe2 = (s & 16777215) << 8;
          break;
        case 0:
        default:
          xe2 = this._themeService.colors.foreground.rgba;
      }
      else switch (o2 & 50331648) {
        case 16777216:
        case 33554432:
          xe2 = this._themeService.colors.ansi[o2 & 255].rgba;
          break;
        case 50331648:
          xe2 = (o2 & 16777215) << 8;
          break;
        case 0:
        default:
          xe2 = this._themeService.colors.background.rgba;
      }
      t.attributes.length < n + 4 && (t.attributes = Bn(t.attributes, this._terminal.rows * this._terminal.cols * Ee4)), Hn = r11 * this._dimensions.device.cell.width, Wn = l2 * this._dimensions.device.cell.height, Gn = (xe2 >> 24 & 255) / 255, $n = (xe2 >> 16 & 255) / 255, Kn = (xe2 >> 8 & 255) / 255, Vn = 1, this._addRectangle(t.attributes, n, Hn, Wn, (a - r11) * this._dimensions.device.cell.width, this._dimensions.device.cell.height, Gn, $n, Kn, Vn);
    }
    _addRectangle(t, n, s, o2, r11, a, l2, u, c, d) {
      t[n] = s / this._dimensions.device.canvas.width, t[n + 1] = o2 / this._dimensions.device.canvas.height, t[n + 2] = r11 / this._dimensions.device.canvas.width, t[n + 3] = a / this._dimensions.device.canvas.height, t[n + 4] = l2, t[n + 5] = u, t[n + 6] = c, t[n + 7] = d;
    }
    _addRectangleFloat(t, n, s, o2, r11, a, l2) {
      t[n] = s / this._dimensions.device.canvas.width, t[n + 1] = o2 / this._dimensions.device.canvas.height, t[n + 2] = r11 / this._dimensions.device.canvas.width, t[n + 3] = a / this._dimensions.device.canvas.height, t[n + 4] = l2[0], t[n + 5] = l2[1], t[n + 6] = l2[2], t[n + 7] = l2[3];
    }
    _colorToFloat32Array(t) {
      return new Float32Array([(t.rgba >> 24 & 255) / 255, (t.rgba >> 16 & 255) / 255, (t.rgba >> 8 & 255) / 255, (t.rgba & 255) / 255]);
    }
  };
  var jt2 = class extends B3 {
    constructor(t, n, s, o2, r11, a, l2, u) {
      super();
      this._container = n;
      this._alpha = r11;
      this._coreBrowserService = a;
      this._optionsService = l2;
      this._themeService = u;
      this._deviceCharWidth = 0;
      this._deviceCharHeight = 0;
      this._deviceCellWidth = 0;
      this._deviceCellHeight = 0;
      this._deviceCharLeft = 0;
      this._deviceCharTop = 0;
      this._canvas = this._coreBrowserService.mainDocument.createElement("canvas"), this._canvas.classList.add(`xterm-${s}-layer`), this._canvas.style.zIndex = o2.toString(), this._initCanvas(), this._container.appendChild(this._canvas), this._register(this._themeService.onChangeColors((c) => {
        this._refreshCharAtlas(t, c), this.reset(t);
      })), this._register(O3(() => {
        this._canvas.remove();
      }));
    }
    _initCanvas() {
      this._ctx = F3(this._canvas.getContext("2d", { alpha: this._alpha })), this._alpha || this._clearAll();
    }
    handleBlur(t) {
    }
    handleFocus(t) {
    }
    handleCursorMove(t) {
    }
    handleGridChanged(t, n, s) {
    }
    handleSelectionChanged(t, n, s, o2 = false) {
    }
    _setTransparency(t, n) {
      if (n === this._alpha) return;
      let s = this._canvas;
      this._alpha = n, this._canvas = this._canvas.cloneNode(), this._initCanvas(), this._container.replaceChild(this._canvas, s), this._refreshCharAtlas(t, this._themeService.colors), this.handleGridChanged(t, 0, t.rows - 1);
    }
    _refreshCharAtlas(t, n) {
      this._deviceCharWidth <= 0 && this._deviceCharHeight <= 0 || (this._charAtlas = Nt3(t, this._optionsService.rawOptions, n, this._deviceCellWidth, this._deviceCellHeight, this._deviceCharWidth, this._deviceCharHeight, this._coreBrowserService.dpr, 2048), this._charAtlas.warmUp());
    }
    resize(t, n) {
      this._deviceCellWidth = n.device.cell.width, this._deviceCellHeight = n.device.cell.height, this._deviceCharWidth = n.device.char.width, this._deviceCharHeight = n.device.char.height, this._deviceCharLeft = n.device.char.left, this._deviceCharTop = n.device.char.top, this._canvas.width = n.device.canvas.width, this._canvas.height = n.device.canvas.height, this._canvas.style.width = `${n.css.canvas.width}px`, this._canvas.style.height = `${n.css.canvas.height}px`, this._alpha || this._clearAll(), this._refreshCharAtlas(t, this._themeService.colors);
    }
    _fillBottomLineAtCells(t, n, s = 1) {
      this._ctx.fillRect(t * this._deviceCellWidth, (n + 1) * this._deviceCellHeight - this._coreBrowserService.dpr - 1, s * this._deviceCellWidth, this._coreBrowserService.dpr);
    }
    _clearAll() {
      this._alpha ? this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height) : (this._ctx.fillStyle = this._themeService.colors.background.css, this._ctx.fillRect(0, 0, this._canvas.width, this._canvas.height));
    }
    _clearCells(t, n, s, o2) {
      this._alpha ? this._ctx.clearRect(t * this._deviceCellWidth, n * this._deviceCellHeight, s * this._deviceCellWidth, o2 * this._deviceCellHeight) : (this._ctx.fillStyle = this._themeService.colors.background.css, this._ctx.fillRect(t * this._deviceCellWidth, n * this._deviceCellHeight, s * this._deviceCellWidth, o2 * this._deviceCellHeight));
    }
    _fillCharTrueColor(t, n, s, o2) {
      this._ctx.font = this._getFont(t, false, false), this._ctx.textBaseline = St3, this._clipCell(s, o2, n.getWidth()), this._ctx.fillText(n.getChars(), s * this._deviceCellWidth + this._deviceCharLeft, o2 * this._deviceCellHeight + this._deviceCharTop + this._deviceCharHeight);
    }
    _clipCell(t, n, s) {
      this._ctx.beginPath(), this._ctx.rect(t * this._deviceCellWidth, n * this._deviceCellHeight, s * this._deviceCellWidth, this._deviceCellHeight), this._ctx.clip();
    }
    _getFont(t, n, s) {
      let o2 = n ? t.options.fontWeightBold : t.options.fontWeight;
      return `${s ? "italic" : ""} ${o2} ${t.options.fontSize * this._coreBrowserService.dpr}px ${t.options.fontFamily}`;
    }
  };
  var Xt = class extends jt2 {
    constructor(e, t, n, s, o2, r11, a) {
      super(n, e, "link", t, true, o2, r11, a), this._register(s.onShowLinkUnderline((l2) => this._handleShowLinkUnderline(l2))), this._register(s.onHideLinkUnderline((l2) => this._handleHideLinkUnderline(l2)));
    }
    resize(e, t) {
      super.resize(e, t), this._state = void 0;
    }
    reset(e) {
      this._clearCurrentLink();
    }
    _clearCurrentLink() {
      if (this._state) {
        this._clearCells(this._state.x1, this._state.y1, this._state.cols - this._state.x1, 1);
        let e = this._state.y2 - this._state.y1 - 1;
        e > 0 && this._clearCells(0, this._state.y1 + 1, this._state.cols, e), this._clearCells(0, this._state.y2, this._state.x2, 1), this._state = void 0;
      }
    }
    _handleShowLinkUnderline(e) {
      if (e.fg === 257 ? this._ctx.fillStyle = this._themeService.colors.background.css : e.fg !== void 0 && Fn(e.fg) ? this._ctx.fillStyle = this._themeService.colors.ansi[e.fg].css : this._ctx.fillStyle = this._themeService.colors.foreground.css, e.y1 === e.y2) this._fillBottomLineAtCells(e.x1, e.y1, e.x2 - e.x1);
      else {
        this._fillBottomLineAtCells(e.x1, e.y1, e.cols - e.x1);
        for (let t = e.y1 + 1; t < e.y2; t++) this._fillBottomLineAtCells(0, t, e.cols);
        this._fillBottomLineAtCells(0, e.y2, e.x2);
      }
      this._state = e;
    }
    _handleHideLinkUnderline(e) {
      this._clearCurrentLink();
    }
  };
  var te5 = typeof window == "object" ? window : globalThis;
  var Zt = class Zt2 {
    constructor() {
      this.mapWindowIdToZoomLevel = /* @__PURE__ */ new Map();
      this._onDidChangeZoomLevel = new D();
      this.onDidChangeZoomLevel = this._onDidChangeZoomLevel.event;
      this.mapWindowIdToZoomFactor = /* @__PURE__ */ new Map();
      this._onDidChangeFullscreen = new D();
      this.onDidChangeFullscreen = this._onDidChangeFullscreen.event;
      this.mapWindowIdToFullScreen = /* @__PURE__ */ new Map();
    }
    getZoomLevel(e) {
      return this.mapWindowIdToZoomLevel.get(this.getWindowId(e)) ?? 0;
    }
    setZoomLevel(e, t) {
      if (this.getZoomLevel(t) === e) return;
      let n = this.getWindowId(t);
      this.mapWindowIdToZoomLevel.set(n, e), this._onDidChangeZoomLevel.fire(n);
    }
    getZoomFactor(e) {
      return this.mapWindowIdToZoomFactor.get(this.getWindowId(e)) ?? 1;
    }
    setZoomFactor(e, t) {
      this.mapWindowIdToZoomFactor.set(this.getWindowId(t), e);
    }
    setFullscreen(e, t) {
      if (this.isFullscreen(t) === e) return;
      let n = this.getWindowId(t);
      this.mapWindowIdToFullScreen.set(n, e), this._onDidChangeFullscreen.fire(n);
    }
    isFullscreen(e) {
      return !!this.mapWindowIdToFullScreen.get(this.getWindowId(e));
    }
    getWindowId(e) {
      return e.vscodeWindowId;
    }
  };
  Zt.INSTANCE = new Zt();
  var Qt = Zt;
  function us(i8, e, t) {
    typeof e == "string" && (e = i8.matchMedia(e)), e.addEventListener("change", t);
  }
  var Wa = Qt.INSTANCE.onDidChangeZoomLevel;
  var Ga = Qt.INSTANCE.onDidChangeFullscreen;
  var je4 = typeof navigator == "object" ? navigator.userAgent : "";
  var Cn = je4.indexOf("Firefox") >= 0;
  var ut2 = je4.indexOf("AppleWebKit") >= 0;
  var zn = je4.indexOf("Chrome") >= 0;
  var Bi = !zn && je4.indexOf("Safari") >= 0;
  var $a = je4.indexOf("Electron/") >= 0;
  var Ka = je4.indexOf("Android") >= 0;
  var Yt = false;
  if (typeof te5.matchMedia == "function") {
    let i8 = te5.matchMedia("(display-mode: standalone) or (display-mode: window-controls-overlay)"), e = te5.matchMedia("(display-mode: fullscreen)");
    Yt = i8.matches, us(te5, i8, ({ matches: t }) => {
      Yt && e.matches || (Yt = t);
    });
  }
  function qn() {
    return Yt;
  }
  var Xe4 = "en";
  var Ui = false;
  var ni = false;
  var ti = false;
  var cs = false;
  var Xn = false;
  var Yn = false;
  var ds = false;
  var hs = false;
  var ps = false;
  var fs = false;
  var ei;
  var ii = Xe4;
  var jn = Xe4;
  var ms;
  var ye3;
  var Ie3 = globalThis;
  var re2;
  typeof Ie3.vscode < "u" && typeof Ie3.vscode.process < "u" ? re2 = Ie3.vscode.process : typeof process < "u" && typeof process?.versions?.node == "string" && (re2 = process);
  var Qn = typeof re2?.versions?.electron == "string";
  var _s = Qn && re2?.type === "renderer";
  if (typeof re2 == "object") {
    Ui = re2.platform === "win32", ni = re2.platform === "darwin", ti = re2.platform === "linux", cs = ti && !!re2.env.SNAP && !!re2.env.SNAP_REVISION, ds = Qn, ps = !!re2.env.CI || !!re2.env.BUILD_ARTIFACTSTAGINGDIRECTORY, ei = Xe4, ii = Xe4;
    let i8 = re2.env.VSCODE_NLS_CONFIG;
    if (i8) try {
      let e = JSON.parse(i8);
      ei = e.userLocale, jn = e.osLocale, ii = e.resolvedLanguage || Xe4, ms = e.languagePack?.translationsConfigFile;
    } catch {
    }
    Xn = true;
  } else typeof navigator == "object" && !_s ? (ye3 = navigator.userAgent, Ui = ye3.indexOf("Windows") >= 0, ni = ye3.indexOf("Macintosh") >= 0, hs = (ye3.indexOf("Macintosh") >= 0 || ye3.indexOf("iPad") >= 0 || ye3.indexOf("iPhone") >= 0) && !!navigator.maxTouchPoints && navigator.maxTouchPoints > 0, ti = ye3.indexOf("Linux") >= 0, fs = ye3?.indexOf("Mobi") >= 0, Yn = true, ii = globalThis._VSCODE_NLS_LANGUAGE || Xe4, ei = navigator.language.toLowerCase(), jn = ei) : console.error("Unable to resolve platform.");
  var Ni = 0;
  ni ? Ni = 1 : Ui ? Ni = 3 : ti && (Ni = 2);
  var ri = Xn;
  var bs = Yn && typeof Ie3.importScripts == "function";
  var Va = bs ? Ie3.origin : void 0;
  var _e2 = ye3;
  var Me4 = ii;
  var vs;
  ((n) => {
    function i8() {
      return Me4;
    }
    n.value = i8;
    function e() {
      return Me4.length === 2 ? Me4 === "en" : Me4.length >= 3 ? Me4[0] === "e" && Me4[1] === "n" && Me4[2] === "-" : false;
    }
    n.isDefaultVariant = e;
    function t() {
      return Me4 === "en";
    }
    n.isDefault = t;
  })(vs || (vs = {}));
  var Ts = typeof Ie3.postMessage == "function" && !Ie3.importScripts;
  var Zn = (() => {
    if (Ts) {
      let i8 = [];
      Ie3.addEventListener("message", (t) => {
        if (t.data && t.data.vscodeScheduleAsyncWork) for (let n = 0, s = i8.length; n < s; n++) {
          let o2 = i8[n];
          if (o2.id === t.data.vscodeScheduleAsyncWork) {
            i8.splice(n, 1), o2.callback();
            return;
          }
        }
      });
      let e = 0;
      return (t) => {
        let n = ++e;
        i8.push({ id: n, callback: t }), Ie3.postMessage({ vscodeScheduleAsyncWork: n }, "*");
      };
    }
    return (i8) => setTimeout(i8);
  })();
  var gs = !!(_e2 && _e2.indexOf("Chrome") >= 0);
  var Ca = !!(_e2 && _e2.indexOf("Firefox") >= 0);
  var za = !!(!gs && _e2 && _e2.indexOf("Safari") >= 0);
  var qa = !!(_e2 && _e2.indexOf("Edg/") >= 0);
  var ja = !!(_e2 && _e2.indexOf("Android") >= 0);
  var Ae4 = typeof navigator == "object" ? navigator : {};
  var xs = { clipboard: { writeText: ri || document.queryCommandSupported && document.queryCommandSupported("copy") || !!(Ae4 && Ae4.clipboard && Ae4.clipboard.writeText), readText: ri || !!(Ae4 && Ae4.clipboard && Ae4.clipboard.readText) }, keyboard: ri || qn() ? 0 : Ae4.keyboard || Bi ? 1 : 2, touch: "ontouchstart" in te5 || Ae4.maxTouchPoints > 0, pointerEvents: te5.PointerEvent && ("ontouchstart" in te5 || navigator.maxTouchPoints > 0) };
  var dt = class {
    constructor() {
      this._keyCodeToStr = [], this._strToKeyCode = /* @__PURE__ */ Object.create(null);
    }
    define(e, t) {
      this._keyCodeToStr[e] = t, this._strToKeyCode[t.toLowerCase()] = e;
    }
    keyCodeToStr(e) {
      return this._keyCodeToStr[e];
    }
    strToKeyCode(e) {
      return this._strToKeyCode[e.toLowerCase()] || 0;
    }
  };
  var Hi = new dt();
  var Jn = new dt();
  var er = new dt();
  var Es = new Array(230);
  var tr;
  ((r11) => {
    function i8(a) {
      return Hi.keyCodeToStr(a);
    }
    r11.toString = i8;
    function e(a) {
      return Hi.strToKeyCode(a);
    }
    r11.fromString = e;
    function t(a) {
      return Jn.keyCodeToStr(a);
    }
    r11.toUserSettingsUS = t;
    function n(a) {
      return er.keyCodeToStr(a);
    }
    r11.toUserSettingsGeneral = n;
    function s(a) {
      return Jn.strToKeyCode(a) || er.strToKeyCode(a);
    }
    r11.fromUserSettings = s;
    function o2(a) {
      if (a >= 98 && a <= 113) return null;
      switch (a) {
        case 16:
          return "Up";
        case 18:
          return "Down";
        case 15:
          return "Left";
        case 17:
          return "Right";
      }
      return Hi.keyCodeToStr(a);
    }
    r11.toElectronAccelerator = o2;
  })(tr || (tr = {}));
  var nr = Object.freeze(function(i8, e) {
    let t = setTimeout(i8.bind(e), 0);
    return { dispose() {
      clearTimeout(t);
    } };
  });
  var Is;
  ((n) => {
    function i8(s) {
      return s === n.None || s === n.Cancelled || s instanceof Wi ? true : !s || typeof s != "object" ? false : typeof s.isCancellationRequested == "boolean" && typeof s.onCancellationRequested == "function";
    }
    n.isCancellationToken = i8, n.None = Object.freeze({ isCancellationRequested: false, onCancellationRequested: ee5.None }), n.Cancelled = Object.freeze({ isCancellationRequested: true, onCancellationRequested: nr });
  })(Is || (Is = {}));
  var Wi = class {
    constructor() {
      this._isCancelled = false;
      this._emitter = null;
    }
    cancel() {
      this._isCancelled || (this._isCancelled = true, this._emitter && (this._emitter.fire(void 0), this.dispose()));
    }
    get isCancellationRequested() {
      return this._isCancelled;
    }
    get onCancellationRequested() {
      return this._isCancelled ? nr : (this._emitter || (this._emitter = new D()), this._emitter.event);
    }
    dispose() {
      this._emitter && (this._emitter.dispose(), this._emitter = null);
    }
  };
  var Ls = Symbol("MicrotaskDelay");
  var ws;
  var oi;
  (function() {
    typeof globalThis.requestIdleCallback != "function" || typeof globalThis.cancelIdleCallback != "function" ? oi = (i8, e) => {
      Zn(() => {
        if (t) return;
        let n = Date.now() + 15;
        e(Object.freeze({ didTimeout: true, timeRemaining() {
          return Math.max(0, n - Date.now());
        } }));
      });
      let t = false;
      return { dispose() {
        t || (t = true);
      } };
    } : oi = (i8, e, t) => {
      let n = i8.requestIdleCallback(e, typeof t == "number" ? { timeout: t } : void 0), s = false;
      return { dispose() {
        s || (s = true, i8.cancelIdleCallback(n));
      } };
    }, ws = (i8) => oi(globalThis, i8);
  })();
  var Rs;
  ((t) => {
    async function i8(n) {
      let s, o2 = await Promise.all(n.map((r11) => r11.then((a) => a, (a) => {
        s || (s = a);
      })));
      if (typeof s < "u") throw s;
      return o2;
    }
    t.settled = i8;
    function e(n) {
      return new Promise(async (s, o2) => {
        try {
          await n(s, o2);
        } catch (r11) {
          o2(r11);
        }
      });
    }
    t.withAsyncBody = e;
  })(Rs || (Rs = {}));
  var Q2 = class Q3 {
    static fromArray(e) {
      return new Q3((t) => {
        t.emitMany(e);
      });
    }
    static fromPromise(e) {
      return new Q3(async (t) => {
        t.emitMany(await e);
      });
    }
    static fromPromises(e) {
      return new Q3(async (t) => {
        await Promise.all(e.map(async (n) => t.emitOne(await n)));
      });
    }
    static merge(e) {
      return new Q3(async (t) => {
        await Promise.all(e.map(async (n) => {
          for await (let s of n) t.emitOne(s);
        }));
      });
    }
    constructor(e, t) {
      this._state = 0, this._results = [], this._error = null, this._onReturn = t, this._onStateChanged = new D(), queueMicrotask(async () => {
        let n = { emitOne: (s) => this.emitOne(s), emitMany: (s) => this.emitMany(s), reject: (s) => this.reject(s) };
        try {
          await Promise.resolve(e(n)), this.resolve();
        } catch (s) {
          this.reject(s);
        } finally {
          n.emitOne = void 0, n.emitMany = void 0, n.reject = void 0;
        }
      });
    }
    [Symbol.asyncIterator]() {
      let e = 0;
      return { next: async () => {
        do {
          if (this._state === 2) throw this._error;
          if (e < this._results.length) return { done: false, value: this._results[e++] };
          if (this._state === 1) return { done: true, value: void 0 };
          await ee5.toPromise(this._onStateChanged.event);
        } while (true);
      }, return: async () => (this._onReturn?.(), { done: true, value: void 0 }) };
    }
    static map(e, t) {
      return new Q3(async (n) => {
        for await (let s of e) n.emitOne(t(s));
      });
    }
    map(e) {
      return Q3.map(this, e);
    }
    static filter(e, t) {
      return new Q3(async (n) => {
        for await (let s of e) t(s) && n.emitOne(s);
      });
    }
    filter(e) {
      return Q3.filter(this, e);
    }
    static coalesce(e) {
      return Q3.filter(e, (t) => !!t);
    }
    coalesce() {
      return Q3.coalesce(this);
    }
    static async toPromise(e) {
      let t = [];
      for await (let n of e) t.push(n);
      return t;
    }
    toPromise() {
      return Q3.toPromise(this);
    }
    emitOne(e) {
      this._state === 0 && (this._results.push(e), this._onStateChanged.fire());
    }
    emitMany(e) {
      this._state === 0 && (this._results = this._results.concat(e), this._onStateChanged.fire());
    }
    resolve() {
      this._state === 0 && (this._state = 1, this._onStateChanged.fire());
    }
    reject(e) {
      this._state === 0 && (this._state = 2, this._error = e, this._onStateChanged.fire());
    }
  };
  Q2.EMPTY = Q2.fromArray([]);
  function sr(i8) {
    return 55296 <= i8 && i8 <= 56319;
  }
  function Gi(i8) {
    return 56320 <= i8 && i8 <= 57343;
  }
  function or(i8, e) {
    return (i8 - 55296 << 10) + (e - 56320) + 65536;
  }
  function ur(i8) {
    return Ki(i8, 0);
  }
  function Ki(i8, e) {
    switch (typeof i8) {
      case "object":
        return i8 === null ? Le4(349, e) : Array.isArray(i8) ? As(i8, e) : Ss(i8, e);
      case "string":
        return cr(i8, e);
      case "boolean":
        return Ms(i8, e);
      case "number":
        return Le4(i8, e);
      case "undefined":
        return Le4(937, e);
      default:
        return Le4(617, e);
    }
  }
  function Le4(i8, e) {
    return (e << 5) - e + i8 | 0;
  }
  function Ms(i8, e) {
    return Le4(i8 ? 433 : 863, e);
  }
  function cr(i8, e) {
    e = Le4(149417, e);
    for (let t = 0, n = i8.length; t < n; t++) e = Le4(i8.charCodeAt(t), e);
    return e;
  }
  function As(i8, e) {
    return e = Le4(104579, e), i8.reduce((t, n) => Ki(n, t), e);
  }
  function Ss(i8, e) {
    return e = Le4(181387, e), Object.keys(i8).sort().reduce((t, n) => (t = cr(n, t), Ki(i8[n], t)), e);
  }
  function $i(i8, e, t = 32) {
    let n = t - e, s = ~((1 << n) - 1);
    return (i8 << e | (s & i8) >>> n) >>> 0;
  }
  function ar(i8, e = 0, t = i8.byteLength, n = 0) {
    for (let s = 0; s < t; s++) i8[e + s] = n;
  }
  function Os(i8, e, t = "0") {
    for (; i8.length < e; ) i8 = t + i8;
    return i8;
  }
  function ht(i8, e = 32) {
    return i8 instanceof ArrayBuffer ? Array.from(new Uint8Array(i8)).map((t) => t.toString(16).padStart(2, "0")).join("") : Os((i8 >>> 0).toString(16), e / 4);
  }
  var ai = class ai2 {
    constructor() {
      this._h0 = 1732584193;
      this._h1 = 4023233417;
      this._h2 = 2562383102;
      this._h3 = 271733878;
      this._h4 = 3285377520;
      this._buff = new Uint8Array(67), this._buffDV = new DataView(this._buff.buffer), this._buffLen = 0, this._totalLen = 0, this._leftoverHighSurrogate = 0, this._finished = false;
    }
    update(e) {
      let t = e.length;
      if (t === 0) return;
      let n = this._buff, s = this._buffLen, o2 = this._leftoverHighSurrogate, r11, a;
      for (o2 !== 0 ? (r11 = o2, a = -1, o2 = 0) : (r11 = e.charCodeAt(0), a = 0); ; ) {
        let l2 = r11;
        if (sr(r11)) if (a + 1 < t) {
          let u = e.charCodeAt(a + 1);
          Gi(u) ? (a++, l2 = or(r11, u)) : l2 = 65533;
        } else {
          o2 = r11;
          break;
        }
        else Gi(r11) && (l2 = 65533);
        if (s = this._push(n, s, l2), a++, a < t) r11 = e.charCodeAt(a);
        else break;
      }
      this._buffLen = s, this._leftoverHighSurrogate = o2;
    }
    _push(e, t, n) {
      return n < 128 ? e[t++] = n : n < 2048 ? (e[t++] = 192 | (n & 1984) >>> 6, e[t++] = 128 | (n & 63) >>> 0) : n < 65536 ? (e[t++] = 224 | (n & 61440) >>> 12, e[t++] = 128 | (n & 4032) >>> 6, e[t++] = 128 | (n & 63) >>> 0) : (e[t++] = 240 | (n & 1835008) >>> 18, e[t++] = 128 | (n & 258048) >>> 12, e[t++] = 128 | (n & 4032) >>> 6, e[t++] = 128 | (n & 63) >>> 0), t >= 64 && (this._step(), t -= 64, this._totalLen += 64, e[0] = e[64], e[1] = e[65], e[2] = e[66]), t;
    }
    digest() {
      return this._finished || (this._finished = true, this._leftoverHighSurrogate && (this._leftoverHighSurrogate = 0, this._buffLen = this._push(this._buff, this._buffLen, 65533)), this._totalLen += this._buffLen, this._wrapUp()), ht(this._h0) + ht(this._h1) + ht(this._h2) + ht(this._h3) + ht(this._h4);
    }
    _wrapUp() {
      this._buff[this._buffLen++] = 128, ar(this._buff, this._buffLen), this._buffLen > 56 && (this._step(), ar(this._buff));
      let e = 8 * this._totalLen;
      this._buffDV.setUint32(56, Math.floor(e / 4294967296), false), this._buffDV.setUint32(60, e % 4294967296, false), this._step();
    }
    _step() {
      let e = ai2._bigBlock32, t = this._buffDV;
      for (let d = 0; d < 64; d += 4) e.setUint32(d, t.getUint32(d, false), false);
      for (let d = 64; d < 320; d += 4) e.setUint32(d, $i(e.getUint32(d - 12, false) ^ e.getUint32(d - 32, false) ^ e.getUint32(d - 56, false) ^ e.getUint32(d - 64, false), 1), false);
      let n = this._h0, s = this._h1, o2 = this._h2, r11 = this._h3, a = this._h4, l2, u, c;
      for (let d = 0; d < 80; d++) d < 20 ? (l2 = s & o2 | ~s & r11, u = 1518500249) : d < 40 ? (l2 = s ^ o2 ^ r11, u = 1859775393) : d < 60 ? (l2 = s & o2 | s & r11 | o2 & r11, u = 2400959708) : (l2 = s ^ o2 ^ r11, u = 3395469782), c = $i(n, 5) + l2 + a + u + e.getUint32(d * 4, false) & 4294967295, a = r11, r11 = o2, o2 = $i(s, 30), s = n, n = c;
      this._h0 = this._h0 + n & 4294967295, this._h1 = this._h1 + s & 4294967295, this._h2 = this._h2 + o2 & 4294967295, this._h3 = this._h3 + r11 & 4294967295, this._h4 = this._h4 + a & 4294967295;
    }
  };
  ai._bigBlock32 = new DataView(new ArrayBuffer(320));
  var { registerWindow: fu, getWindow: Fs, getDocument: mu, getWindows: _u, getWindowsCount: bu, getWindowId: dr, getWindowById: vu, hasWindow: Tu, onDidRegisterWindow: gu, onWillUnregisterWindow: xu, onDidUnregisterWindow: Eu } = (function() {
    let i8 = /* @__PURE__ */ new Map();
    te5;
    let e = { window: te5, disposables: new fe4() };
    i8.set(te5.vscodeWindowId, e);
    let t = new D(), n = new D(), s = new D();
    function o2(r11, a) {
      return (typeof r11 == "number" ? i8.get(r11) : void 0) ?? (a ? e : void 0);
    }
    return { onDidRegisterWindow: t.event, onWillUnregisterWindow: s.event, onDidUnregisterWindow: n.event, registerWindow(r11) {
      if (i8.has(r11.vscodeWindowId)) return B3.None;
      let a = new fe4(), l2 = { window: r11, disposables: a.add(new fe4()) };
      return i8.set(r11.vscodeWindowId, l2), a.add(O3(() => {
        i8.delete(r11.vscodeWindowId), n.fire(r11);
      })), a.add(li(r11, Ps.BEFORE_UNLOAD, () => {
        s.fire(r11);
      })), t.fire(l2), a;
    }, getWindows() {
      return i8.values();
    }, getWindowsCount() {
      return i8.size;
    }, getWindowId(r11) {
      return r11.vscodeWindowId;
    }, hasWindow(r11) {
      return i8.has(r11);
    }, getWindowById: o2, getWindow(r11) {
      let a = r11;
      if (a?.ownerDocument?.defaultView) return a.ownerDocument.defaultView.window;
      let l2 = r11;
      return l2?.view ? l2.view.window : te5;
    }, getDocument(r11) {
      return Fs(r11).document;
    } };
  })();
  var Vi = class {
    constructor(e, t, n, s) {
      this._node = e, this._type = t, this._handler = n, this._options = s || false, this._node.addEventListener(this._type, this._handler, this._options);
    }
    dispose() {
      this._handler && (this._node.removeEventListener(this._type, this._handler, this._options), this._node = null, this._handler = null);
    }
  };
  function li(i8, e, t, n) {
    return new Vi(i8, e, t, n);
  }
  var ks;
  var hr;
  var pt3 = class {
    constructor(e, t = 0) {
      this._runner = e, this.priority = t, this._canceled = false;
    }
    dispose() {
      this._canceled = true;
    }
    execute() {
      if (!this._canceled) try {
        this._runner();
      } catch (e) {
        Pe4(e);
      }
    }
    static sort(e, t) {
      return t.priority - e.priority;
    }
  };
  (function() {
    let i8 = /* @__PURE__ */ new Map(), e = /* @__PURE__ */ new Map(), t = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map(), s = (o2) => {
      t.set(o2, false);
      let r11 = i8.get(o2) ?? [];
      for (e.set(o2, r11), i8.set(o2, []), n.set(o2, true); r11.length > 0; ) r11.sort(pt3.sort), r11.shift().execute();
      n.set(o2, false);
    };
    hr = (o2, r11, a = 0) => {
      let l2 = dr(o2), u = new pt3(r11, a), c = i8.get(l2);
      return c || (c = [], i8.set(l2, c)), c.push(u), t.get(l2) || (t.set(l2, true), o2.requestAnimationFrame(() => s(l2))), u;
    }, ks = (o2, r11, a) => {
      let l2 = dr(o2);
      if (n.get(l2)) {
        let u = new pt3(r11, a), c = e.get(l2);
        return c || (c = [], e.set(l2, c)), c.push(u), u;
      } else return hr(o2, r11, a);
    };
  })();
  var ke4 = class ke5 {
    constructor(e, t) {
      this.width = e;
      this.height = t;
    }
    with(e = this.width, t = this.height) {
      return e !== this.width || t !== this.height ? new ke5(e, t) : this;
    }
    static is(e) {
      return typeof e == "object" && typeof e.height == "number" && typeof e.width == "number";
    }
    static lift(e) {
      return e instanceof ke5 ? e : new ke5(e.width, e.height);
    }
    static equals(e, t) {
      return e === t ? true : !e || !t ? false : e.width === t.width && e.height === t.height;
    }
  };
  ke4.None = new ke4(0, 0);
  var yu = new class {
    constructor() {
      this.mutationObservers = /* @__PURE__ */ new Map();
    }
    observe(i8, e, t) {
      let n = this.mutationObservers.get(i8);
      n || (n = /* @__PURE__ */ new Map(), this.mutationObservers.set(i8, n));
      let s = ur(t), o2 = n.get(s);
      if (o2) o2.users += 1;
      else {
        let r11 = new D(), a = new MutationObserver((u) => r11.fire(u));
        a.observe(i8, t);
        let l2 = o2 = { users: 1, observer: a, onDidMutate: r11.event };
        e.add(O3(() => {
          l2.users -= 1, l2.users === 0 && (r11.dispose(), a.disconnect(), n?.delete(s), n?.size === 0 && this.mutationObservers.delete(i8));
        })), n.set(s, o2);
      }
      return o2.onDidMutate;
    }
  }();
  var Ps = { CLICK: "click", AUXCLICK: "auxclick", DBLCLICK: "dblclick", MOUSE_UP: "mouseup", MOUSE_DOWN: "mousedown", MOUSE_OVER: "mouseover", MOUSE_MOVE: "mousemove", MOUSE_OUT: "mouseout", MOUSE_ENTER: "mouseenter", MOUSE_LEAVE: "mouseleave", MOUSE_WHEEL: "wheel", POINTER_UP: "pointerup", POINTER_DOWN: "pointerdown", POINTER_MOVE: "pointermove", POINTER_LEAVE: "pointerleave", CONTEXT_MENU: "contextmenu", WHEEL: "wheel", KEY_DOWN: "keydown", KEY_PRESS: "keypress", KEY_UP: "keyup", LOAD: "load", BEFORE_UNLOAD: "beforeunload", UNLOAD: "unload", PAGE_SHOW: "pageshow", PAGE_HIDE: "pagehide", PASTE: "paste", ABORT: "abort", ERROR: "error", RESIZE: "resize", SCROLL: "scroll", FULLSCREEN_CHANGE: "fullscreenchange", WK_FULLSCREEN_CHANGE: "webkitfullscreenchange", SELECT: "select", CHANGE: "change", SUBMIT: "submit", RESET: "reset", FOCUS: "focus", FOCUS_IN: "focusin", FOCUS_OUT: "focusout", BLUR: "blur", INPUT: "input", STORAGE: "storage", DRAG_START: "dragstart", DRAG: "drag", DRAG_ENTER: "dragenter", DRAG_LEAVE: "dragleave", DRAG_OVER: "dragover", DROP: "drop", DRAG_END: "dragend", ANIMATION_START: ut2 ? "webkitAnimationStart" : "animationstart", ANIMATION_END: ut2 ? "webkitAnimationEnd" : "animationend", ANIMATION_ITERATION: ut2 ? "webkitAnimationIteration" : "animationiteration" };
  var Bs = /([\w\-]+)?(#([\w\-]+))?((\.([\w\-]+))*)/;
  function fr(i8, e, t, ...n) {
    let s = Bs.exec(e);
    if (!s) throw new Error("Bad use of emmet");
    let o2 = s[1] || "div", r11;
    return i8 !== "http://www.w3.org/1999/xhtml" ? r11 = document.createElementNS(i8, o2) : r11 = document.createElement(o2), s[3] && (r11.id = s[3]), s[4] && (r11.className = s[4].replace(/\./g, " ").trim()), t && Object.entries(t).forEach(([a, l2]) => {
      typeof l2 > "u" || (/^on\w+$/.test(a) ? r11[a] = l2 : a === "selected" ? l2 && r11.setAttribute(a, "true") : r11.setAttribute(a, l2));
    }), r11.append(...n), r11;
  }
  function Ns(i8, e, ...t) {
    return fr("http://www.w3.org/1999/xhtml", i8, e, ...t);
  }
  Ns.SVG = function(i8, e, ...t) {
    return fr("http://www.w3.org/2000/svg", i8, e, ...t);
  };
  var ui = class extends B3 {
    constructor(t, n, s, o2, r11, a, l2, u, c) {
      super();
      this._terminal = t;
      this._characterJoinerService = n;
      this._charSizeService = s;
      this._coreBrowserService = o2;
      this._coreService = r11;
      this._decorationService = a;
      this._optionsService = l2;
      this._themeService = u;
      this._cursorBlinkStateManager = new be5();
      this._charAtlasDisposable = this._register(new be5());
      this._observerDisposable = this._register(new be5());
      this._model = new Vt();
      this._workCell = new at4();
      this._workCell2 = new at4();
      this._rectangleRenderer = this._register(new be5());
      this._glyphRenderer = this._register(new be5());
      this._onChangeTextureAtlas = this._register(new D());
      this.onChangeTextureAtlas = this._onChangeTextureAtlas.event;
      this._onAddTextureAtlasCanvas = this._register(new D());
      this.onAddTextureAtlasCanvas = this._onAddTextureAtlasCanvas.event;
      this._onRemoveTextureAtlasCanvas = this._register(new D());
      this.onRemoveTextureAtlasCanvas = this._onRemoveTextureAtlasCanvas.event;
      this._onRequestRedraw = this._register(new D());
      this.onRequestRedraw = this._onRequestRedraw.event;
      this._onContextLoss = this._register(new D());
      this.onContextLoss = this._onContextLoss.event;
      this._canvas = this._coreBrowserService.mainDocument.createElement("canvas");
      let d = { antialias: false, depth: false, preserveDrawingBuffer: c };
      if (this._gl = this._canvas.getContext("webgl2", d), !this._gl) throw new Error("WebGL2 not supported " + this._gl);
      this._register(this._themeService.onChangeColors(() => this._handleColorChange())), this._cellColorResolver = new At3(this._terminal, this._optionsService, this._model.selection, this._decorationService, this._coreBrowserService, this._themeService), this._core = this._terminal._core, this._renderLayers = [new Xt(this._core.screenElement, 2, this._terminal, this._core.linkifier, this._coreBrowserService, l2, this._themeService)], this.dimensions = _n(), this._devicePixelRatio = this._coreBrowserService.dpr, this._updateDimensions(), this._updateCursorBlink(), this._register(l2.onOptionChange(() => this._handleOptionsChanged())), this._deviceMaxTextureSize = this._gl.getParameter(this._gl.MAX_TEXTURE_SIZE), this._register(li(this._canvas, "webglcontextlost", (h2) => {
        console.log("webglcontextlost event received"), h2.preventDefault(), this._contextRestorationTimeout = setTimeout(() => {
          this._contextRestorationTimeout = void 0, console.warn("webgl context not restored; firing onContextLoss"), this._onContextLoss.fire(h2);
        }, 3e3);
      })), this._register(li(this._canvas, "webglcontextrestored", (h2) => {
        console.warn("webglcontextrestored event received"), clearTimeout(this._contextRestorationTimeout), this._contextRestorationTimeout = void 0, Ai(this._terminal), this._initializeWebGLState(), this._requestRedrawViewport();
      })), this._observerDisposable.value = Si(this._canvas, this._coreBrowserService.window, (h2, f) => this._setCanvasDevicePixelDimensions(h2, f)), this._register(this._coreBrowserService.onWindowChange((h2) => {
        this._observerDisposable.value = Si(this._canvas, h2, (f, I2) => this._setCanvasDevicePixelDimensions(f, I2));
      })), this._core.screenElement.appendChild(this._canvas), [this._rectangleRenderer.value, this._glyphRenderer.value] = this._initializeWebGLState(), this._isAttached = this._core.screenElement.isConnected, this._register(O3(() => {
        for (let h2 of this._renderLayers) h2.dispose();
        this._canvas.parentElement?.removeChild(this._canvas), Ai(this._terminal);
      }));
    }
    get textureAtlas() {
      return this._charAtlas?.pages[0].canvas;
    }
    _handleColorChange() {
      this._refreshCharAtlas(), this._clearModel(true);
    }
    handleDevicePixelRatioChange() {
      this._devicePixelRatio !== this._coreBrowserService.dpr && (this._devicePixelRatio = this._coreBrowserService.dpr, this.handleResize(this._terminal.cols, this._terminal.rows));
    }
    handleResize(t, n) {
      this._updateDimensions(), this._model.resize(this._terminal.cols, this._terminal.rows);
      for (let s of this._renderLayers) s.resize(this._terminal, this.dimensions);
      this._canvas.width = this.dimensions.device.canvas.width, this._canvas.height = this.dimensions.device.canvas.height, this._canvas.style.width = `${this.dimensions.css.canvas.width}px`, this._canvas.style.height = `${this.dimensions.css.canvas.height}px`, this._core.screenElement.style.width = `${this.dimensions.css.canvas.width}px`, this._core.screenElement.style.height = `${this.dimensions.css.canvas.height}px`, this._rectangleRenderer.value?.setDimensions(this.dimensions), this._rectangleRenderer.value?.handleResize(), this._glyphRenderer.value?.setDimensions(this.dimensions), this._glyphRenderer.value?.handleResize(), this._refreshCharAtlas(), this._clearModel(false);
    }
    handleCharSizeChanged() {
      this.handleResize(this._terminal.cols, this._terminal.rows);
    }
    handleBlur() {
      for (let t of this._renderLayers) t.handleBlur(this._terminal);
      this._cursorBlinkStateManager.value?.pause(), this._requestRedrawViewport();
    }
    handleFocus() {
      for (let t of this._renderLayers) t.handleFocus(this._terminal);
      this._cursorBlinkStateManager.value?.resume(), this._requestRedrawViewport();
    }
    handleSelectionChanged(t, n, s) {
      for (let o2 of this._renderLayers) o2.handleSelectionChanged(this._terminal, t, n, s);
      this._model.selection.update(this._core, t, n, s), this._requestRedrawViewport();
    }
    handleCursorMove() {
      for (let t of this._renderLayers) t.handleCursorMove(this._terminal);
      this._cursorBlinkStateManager.value?.restartBlinkAnimation();
    }
    _handleOptionsChanged() {
      this._updateDimensions(), this._refreshCharAtlas(), this._updateCursorBlink();
    }
    _initializeWebGLState() {
      return this._rectangleRenderer.value = new qt2(this._terminal, this._gl, this.dimensions, this._themeService), this._glyphRenderer.value = new Kt(this._terminal, this._gl, this.dimensions, this._optionsService), this.handleCharSizeChanged(), [this._rectangleRenderer.value, this._glyphRenderer.value];
    }
    _refreshCharAtlas() {
      if (this.dimensions.device.char.width <= 0 && this.dimensions.device.char.height <= 0) {
        this._isAttached = false;
        return;
      }
      let t = Nt3(this._terminal, this._optionsService.rawOptions, this._themeService.colors, this.dimensions.device.cell.width, this.dimensions.device.cell.height, this.dimensions.device.char.width, this.dimensions.device.char.height, this._coreBrowserService.dpr, this._deviceMaxTextureSize);
      this._charAtlas !== t && (this._onChangeTextureAtlas.fire(t.pages[0].canvas), this._charAtlasDisposable.value = It3(ee5.forward(t.onAddTextureAtlasCanvas, this._onAddTextureAtlasCanvas), ee5.forward(t.onRemoveTextureAtlasCanvas, this._onRemoveTextureAtlasCanvas))), this._charAtlas = t, this._charAtlas.warmUp(), this._glyphRenderer.value?.setAtlas(this._charAtlas);
    }
    _clearModel(t) {
      this._model.clear(), t && this._glyphRenderer.value?.clear();
    }
    clearTextureAtlas() {
      this._charAtlas?.clearTexture(), this._clearModel(true), this._requestRedrawViewport();
    }
    clear() {
      this._clearModel(true);
      for (let t of this._renderLayers) t.reset(this._terminal);
      this._cursorBlinkStateManager.value?.restartBlinkAnimation(), this._updateCursorBlink();
    }
    renderRows(t, n) {
      if (!this._isAttached) if (this._core.screenElement?.isConnected && this._charSizeService.width && this._charSizeService.height) this._updateDimensions(), this._refreshCharAtlas(), this._isAttached = true;
      else return;
      for (let s of this._renderLayers) s.handleGridChanged(this._terminal, t, n);
      !this._glyphRenderer.value || !this._rectangleRenderer.value || (this._glyphRenderer.value.beginFrame() ? (this._clearModel(true), this._updateModel(0, this._terminal.rows - 1)) : this._updateModel(t, n), this._rectangleRenderer.value.renderBackgrounds(), this._glyphRenderer.value.render(this._model), (!this._cursorBlinkStateManager.value || this._cursorBlinkStateManager.value.isCursorVisible) && this._rectangleRenderer.value.renderCursor());
    }
    _updateCursorBlink() {
      this._coreService.decPrivateModes.cursorBlink ?? this._terminal.options.cursorBlink ? this._cursorBlinkStateManager.value = new Ht2(() => {
        this._requestRedrawCursor();
      }, this._coreBrowserService) : this._cursorBlinkStateManager.clear(), this._requestRedrawCursor();
    }
    _updateModel(t, n) {
      let s = this._core, o2 = this._workCell, r11, a, l2, u, c, d, h2 = 0, f = true, I2, L2, M6, q3, S2, W3, E, y, w4;
      t = mr(t, s.rows - 1, 0), n = mr(n, s.rows - 1, 0);
      let G4 = this._coreService.decPrivateModes.cursorStyle ?? s.options.cursorStyle ?? "block", ue5 = this._terminal.buffer.active.baseY + this._terminal.buffer.active.cursorY, Se2 = ue5 - s.buffer.ydisp, ce4 = Math.min(this._terminal.buffer.active.cursorX, s.cols - 1), we3 = -1, A3 = this._coreService.isCursorInitialized && !this._coreService.isCursorHidden && (!this._cursorBlinkStateManager.value || this._cursorBlinkStateManager.value.isCursorVisible);
      this._model.cursor = void 0;
      let se3 = false;
      for (a = t; a <= n; a++) for (l2 = a + s.buffer.ydisp, u = s.buffer.lines.get(l2), this._model.lineLengths[a] = 0, M6 = ue5 === l2, h2 = 0, c = this._characterJoinerService.getJoinedCharacters(l2), y = 0; y < s.cols; y++) {
        if (r11 = this._cellColorResolver.result.bg, u.loadCell(y, o2), y === 0 && (r11 = this._cellColorResolver.result.bg), d = false, f = y >= h2, I2 = y, c.length > 0 && y === c[0][0] && f) {
          L2 = c.shift();
          let v3 = this._model.selection.isCellSelected(this._terminal, L2[0], l2);
          for (E = L2[0] + 1; E < L2[1]; E++) f && (f = v3 === this._model.selection.isCellSelected(this._terminal, E, l2));
          f && (f = !M6 || ce4 < L2[0] || ce4 >= L2[1]), f ? (d = true, o2 = new Ci(o2, u.translateToString(true, L2[0], L2[1]), L2[1] - L2[0]), I2 = L2[1] - 1) : h2 = L2[1];
        }
        if (q3 = o2.getChars(), S2 = o2.getCode(), E = (a * s.cols + y) * Ce2, this._cellColorResolver.resolve(o2, y, l2, this.dimensions.device.cell.width), A3 && l2 === ue5 && (y === ce4 && (this._model.cursor = { x: ce4, y: Se2, width: o2.getWidth(), style: this._coreBrowserService.isFocused ? G4 : s.options.cursorInactiveStyle, cursorWidth: s.options.cursorWidth, dpr: this._devicePixelRatio }, we3 = ce4 + o2.getWidth() - 1), y >= ce4 && y <= we3 && (this._coreBrowserService.isFocused && G4 === "block" || this._coreBrowserService.isFocused === false && s.options.cursorInactiveStyle === "block") && (this._cellColorResolver.result.fg = 50331648 | this._themeService.colors.cursorAccent.rgba >> 8 & 16777215, this._cellColorResolver.result.bg = 50331648 | this._themeService.colors.cursor.rgba >> 8 & 16777215)), S2 !== 0 && (this._model.lineLengths[a] = y + 1), !(this._model.cells[E] === S2 && this._model.cells[E + ze3] === this._cellColorResolver.result.bg && this._model.cells[E + qe4] === this._cellColorResolver.result.fg && this._model.cells[E + Ct3] === this._cellColorResolver.result.ext) && (se3 = true, q3.length > 1 && (S2 |= Un), this._model.cells[E] = S2, this._model.cells[E + ze3] = this._cellColorResolver.result.bg, this._model.cells[E + qe4] = this._cellColorResolver.result.fg, this._model.cells[E + Ct3] = this._cellColorResolver.result.ext, W3 = o2.getWidth(), this._glyphRenderer.value.updateCell(y, a, S2, this._cellColorResolver.result.bg, this._cellColorResolver.result.fg, this._cellColorResolver.result.ext, q3, W3, r11), d)) {
          for (o2 = this._workCell, y++; y <= I2; y++) w4 = (a * s.cols + y) * Ce2, this._glyphRenderer.value.updateCell(y, a, 0, 0, 0, 0, pn, 0, 0), this._model.cells[w4] = 0, this._model.cells[w4 + ze3] = this._cellColorResolver.result.bg, this._model.cells[w4 + qe4] = this._cellColorResolver.result.fg, this._model.cells[w4 + Ct3] = this._cellColorResolver.result.ext;
          y--;
        }
      }
      se3 && this._rectangleRenderer.value.updateBackgrounds(this._model), this._rectangleRenderer.value.updateCursor(this._model);
    }
    _updateDimensions() {
      !this._charSizeService.width || !this._charSizeService.height || (this.dimensions.device.char.width = Math.floor(this._charSizeService.width * this._devicePixelRatio), this.dimensions.device.char.height = Math.ceil(this._charSizeService.height * this._devicePixelRatio), this.dimensions.device.cell.height = Math.floor(this.dimensions.device.char.height * this._optionsService.rawOptions.lineHeight), this.dimensions.device.char.top = this._optionsService.rawOptions.lineHeight === 1 ? 0 : Math.round((this.dimensions.device.cell.height - this.dimensions.device.char.height) / 2), this.dimensions.device.cell.width = this.dimensions.device.char.width + Math.round(this._optionsService.rawOptions.letterSpacing), this.dimensions.device.char.left = Math.floor(this._optionsService.rawOptions.letterSpacing / 2), this.dimensions.device.canvas.height = this._terminal.rows * this.dimensions.device.cell.height, this.dimensions.device.canvas.width = this._terminal.cols * this.dimensions.device.cell.width, this.dimensions.css.canvas.height = Math.round(this.dimensions.device.canvas.height / this._devicePixelRatio), this.dimensions.css.canvas.width = Math.round(this.dimensions.device.canvas.width / this._devicePixelRatio), this.dimensions.css.cell.height = this.dimensions.device.cell.height / this._devicePixelRatio, this.dimensions.css.cell.width = this.dimensions.device.cell.width / this._devicePixelRatio);
    }
    _setCanvasDevicePixelDimensions(t, n) {
      this._canvas.width === t && this._canvas.height === n || (this._canvas.width = t, this._canvas.height = n, this._requestRedrawViewport());
    }
    _requestRedrawViewport() {
      this._onRequestRedraw.fire({ start: 0, end: this._terminal.rows - 1 });
    }
    _requestRedrawCursor() {
      let t = this._terminal.buffer.active.cursorY;
      this._onRequestRedraw.fire({ start: t, end: t });
    }
  };
  var Ci = class extends he4 {
    constructor(t, n, s) {
      super();
      this.content = 0;
      this.combinedData = "";
      this.fg = t.fg, this.bg = t.bg, this.combinedData = n, this._width = s;
    }
    isCombined() {
      return 2097152;
    }
    getWidth() {
      return this._width;
    }
    getChars() {
      return this.combinedData;
    }
    getCode() {
      return 2097151;
    }
    setFromCharData(t) {
      throw new Error("not implemented");
    }
    getAsCharData() {
      return [this.fg, this.getChars(), this.getWidth(), this.getCode()];
    }
  };
  function mr(i8, e, t = 0) {
    return Math.max(Math.min(i8, e), t);
  }
  var _r = "di$target";
  var br = "di$dependencies";
  var zi = /* @__PURE__ */ new Map();
  function pe4(i8) {
    if (zi.has(i8)) return zi.get(i8);
    let e = function(t, n, s) {
      if (arguments.length !== 3) throw new Error("@IServiceName-decorator can only be used to decorate a parameter");
      Us(e, t, s);
    };
    return e._id = i8, zi.set(i8, e), e;
  }
  function Us(i8, e, t) {
    e[_r] === e ? e[br].push({ id: i8, index: t }) : (e[br] = [{ id: i8, index: t }], e[_r] = e);
  }
  var Vu = pe4("BufferService");
  var Cu = pe4("CoreMouseService");
  var zu = pe4("CoreService");
  var qu = pe4("CharsetService");
  var ju = pe4("InstantiationService");
  var Xu = pe4("LogService");
  var vr = pe4("OptionsService");
  var Yu = pe4("OscLinkService");
  var Qu = pe4("UnicodeService");
  var Zu = pe4("DecorationService");
  var Hs = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, off: 5 };
  var Ws = "xterm.js: ";
  var ci = class extends B3 {
    constructor(t) {
      super();
      this._optionsService = t;
      this._logLevel = 5;
      this._updateLogLevel(), this._register(this._optionsService.onSpecificOptionChange("logLevel", () => this._updateLogLevel())), Tr = this;
    }
    get logLevel() {
      return this._logLevel;
    }
    _updateLogLevel() {
      this._logLevel = Hs[this._optionsService.rawOptions.logLevel];
    }
    _evalLazyOptionalParams(t) {
      for (let n = 0; n < t.length; n++) typeof t[n] == "function" && (t[n] = t[n]());
    }
    _log(t, n, s) {
      this._evalLazyOptionalParams(s), t.call(console, (this._optionsService.options.logger ? "" : Ws) + n, ...s);
    }
    trace(t, ...n) {
      this._logLevel <= 0 && this._log(this._optionsService.options.logger?.trace.bind(this._optionsService.options.logger) ?? console.log, t, n);
    }
    debug(t, ...n) {
      this._logLevel <= 1 && this._log(this._optionsService.options.logger?.debug.bind(this._optionsService.options.logger) ?? console.log, t, n);
    }
    info(t, ...n) {
      this._logLevel <= 2 && this._log(this._optionsService.options.logger?.info.bind(this._optionsService.options.logger) ?? console.info, t, n);
    }
    warn(t, ...n) {
      this._logLevel <= 3 && this._log(this._optionsService.options.logger?.warn.bind(this._optionsService.options.logger) ?? console.warn, t, n);
    }
    error(t, ...n) {
      this._logLevel <= 4 && this._log(this._optionsService.options.logger?.error.bind(this._optionsService.options.logger) ?? console.error, t, n);
    }
  };
  ci = Yi([Qi(0, vr)], ci);
  var Tr;
  function gr(i8) {
    Tr = i8;
  }
  var xr = class extends B3 {
    constructor(t) {
      if (vi && hn() < 16) {
        let n = { antialias: false, depth: false, preserveDrawingBuffer: true };
        if (!document.createElement("canvas").getContext("webgl2", n)) throw new Error("Webgl2 is only supported on Safari 16 and above");
      }
      super();
      this._preserveDrawingBuffer = t;
      this._onChangeTextureAtlas = this._register(new D());
      this.onChangeTextureAtlas = this._onChangeTextureAtlas.event;
      this._onAddTextureAtlasCanvas = this._register(new D());
      this.onAddTextureAtlasCanvas = this._onAddTextureAtlasCanvas.event;
      this._onRemoveTextureAtlasCanvas = this._register(new D());
      this.onRemoveTextureAtlasCanvas = this._onRemoveTextureAtlasCanvas.event;
      this._onContextLoss = this._register(new D());
      this.onContextLoss = this._onContextLoss.event;
    }
    activate(t) {
      let n = t._core;
      if (!t.element) {
        this._register(n.onWillOpen(() => this.activate(t)));
        return;
      }
      this._terminal = t;
      let s = n.coreService, o2 = n.optionsService, r11 = n, a = r11._renderService, l2 = r11._characterJoinerService, u = r11._charSizeService, c = r11._coreBrowserService, d = r11._decorationService, h2 = r11._logService, f = r11._themeService;
      gr(h2), this._renderer = this._register(new ui(t, l2, u, c, s, d, o2, f, this._preserveDrawingBuffer)), this._register(ee5.forward(this._renderer.onContextLoss, this._onContextLoss)), this._register(ee5.forward(this._renderer.onChangeTextureAtlas, this._onChangeTextureAtlas)), this._register(ee5.forward(this._renderer.onAddTextureAtlasCanvas, this._onAddTextureAtlasCanvas)), this._register(ee5.forward(this._renderer.onRemoveTextureAtlasCanvas, this._onRemoveTextureAtlasCanvas)), a.setRenderer(this._renderer), this._register(O3(() => {
        if (this._terminal._core._store._isDisposed) return;
        let I2 = this._terminal._core._renderService;
        I2.setRenderer(this._terminal._core._createRenderer()), I2.handleResize(t.cols, t.rows);
      }));
    }
    get textureAtlas() {
      return this._renderer?.textureAtlas;
    }
    clearTextureAtlas() {
      this._renderer?.clearTextureAtlas();
    }
  };

  // friscy-bundle/app.ts
  var FRISCY_THEME = {
    background: "#0a0e14",
    foreground: "#e6e1cf",
    selectionBackground: "#1d3b53",
    selectionForeground: "#e6e1cf",
    selectionInactiveBackground: "#14222e",
    cursor: "#ff8f40",
    cursorAccent: "#0a0e14",
    black: "#1c2433",
    red: "#ff3333",
    green: "#c2d94c",
    yellow: "#ff8f40",
    blue: "#59c2ff",
    magenta: "#d2a6ff",
    cyan: "#73d0ff",
    white: "#c7c7c7",
    brightBlack: "#3e4b59",
    brightRed: "#ff6666",
    brightGreen: "#bae67e",
    brightYellow: "#ffb454",
    brightBlue: "#73b8ff",
    brightMagenta: "#dfbfff",
    brightCyan: "#95e6cb",
    brightWhite: "#f0f0f0"
  };
  var HISTORY_KEY = "friscy-cmd-history";
  var HISTORY_MAX = 500;
  var cmdHistory = {
    _entries: JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"),
    _pos: -1,
    push(cmd) {
      if (!cmd.trim()) return;
      if (this._entries[this._entries.length - 1] === cmd) return;
      this._entries.push(cmd);
      if (this._entries.length > HISTORY_MAX) this._entries.shift();
      this._pos = -1;
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(this._entries));
      } catch (_e3) {
      }
    },
    up() {
      if (this._entries.length === 0) return void 0;
      if (this._pos < 0) this._pos = this._entries.length;
      this._pos = Math.max(0, this._pos - 1);
      return this._entries[this._pos];
    },
    down() {
      if (this._pos < 0) return "";
      this._pos = Math.min(this._entries.length, this._pos + 1);
      return this._pos < this._entries.length ? this._entries[this._pos] : "";
    },
    reset() {
      this._pos = -1;
    }
  };
  function setupDragDrop(terminalEl2, term3) {
    if (!terminalEl2) return;
    const imageSidePanel = document.getElementById("image-side-panel");
    const droppedImagePreview = document.getElementById("dropped-image-preview");
    const imageSidePanelClose = document.getElementById("image-side-panel-close");
    if (imageSidePanelClose) {
      imageSidePanelClose.addEventListener("click", () => {
        imageSidePanel?.classList.remove("open");
        if (droppedImagePreview) droppedImagePreview.src = "";
      });
    }
    terminalEl2.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      terminalEl2.style.outline = "2px solid #ff8f40";
      terminalEl2.style.outlineOffset = "-2px";
    });
    terminalEl2.addEventListener("dragleave", () => {
      terminalEl2.style.outline = "";
    });
    terminalEl2.addEventListener("drop", (e) => {
      e.preventDefault();
      terminalEl2.style.outline = "";
      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          term3.writeln(`
\x1B[33m[drop] Skipping non-image: ${file.name}\x1B[0m`);
          continue;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          const dataURL = event.target?.result;
          const b64 = dataURL.split(",")[1];
          const params = `name=${btoa(file.name)};size=${file.size};inline=1`;
          term3.write(`\x1B]1337;File=${params}:${b64}\x07`);
          term3.writeln(`
\x1B[36m[drop] ${file.name} (${(file.size / 1024).toFixed(1)}KB)\x1B[0m`);
          if (droppedImagePreview) droppedImagePreview.src = dataURL;
          imageSidePanel?.classList.add("open");
        };
        reader.readAsDataURL(file);
      }
    });
  }
  function setupClipboard(term3) {
    term3.attachCustomKeyEventHandler((e) => {
      if (e.ctrlKey && e.key === "c" && e.type === "keydown") {
        const sel = term3.getSelection();
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {
          });
          term3.clearSelection();
          return false;
        }
        return true;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "v" && e.type === "keydown") {
        navigator.clipboard.readText().then((text) => {
          if (text) term3.paste(text);
        }).catch(() => {
        });
        return false;
      }
      return true;
    });
  }
  var statusEl = document.getElementById("status");
  var netStatusEl = document.getElementById("net-status");
  var terminalEl = document.getElementById("terminal");
  var term;
  var fitAddon;
  var worker = null;
  var machineRunning = false;
  var controlSab = null;
  var stdoutSab = null;
  var netSab = null;
  var controlView = null;
  var stdoutView = null;
  var stdoutBytes = null;
  var RING_HEADER = 8;
  var RING_SIZE = 65528;
  var CMD_IDLE = 0;
  var CMD_STDIN_REQUEST = 2;
  var CMD_STDIN_READY = 3;
  var CMD_EXIT = 4;
  var CMD_EXPORT_CHECKPOINT = 9;
  var stdinQueue = [];
  var term2 = null;
  var fitAddon2 = null;
  var worker2 = null;
  window._friscyStdinQueue = stdinQueue;
  window.__friscyJitStats = null;
  window.__friscyProcessEvents = [];
  window.__friscyProcessEventLog = [];
  window._friscyAwaitStdinRequest = async (timeoutMs = 6e4) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (controlView && Atomics.load(controlView, 0) === CMD_STDIN_REQUEST) return true;
      await new Promise((r11) => setTimeout(r11, 50));
    }
    return false;
  };
  async function exportLiveCheckpointUpload(filename = "friscy-live.ckpt") {
    if (!worker) throw new Error("Worker not initialized");
    return await new Promise((resolve, reject) => {
      const w4 = worker;
      let settled = false;
      const onMsg = async (e) => {
        if (e.data?.type === "checkpoint-exported-live") {
          settled = true;
          w4.removeEventListener("message", onMsg);
          try {
            const resp = await fetch("/__upload_checkpoint/" + encodeURIComponent(filename), {
              method: "POST",
              body: e.data.data
            });
            const json = await resp.json();
            if (!resp.ok || !json.ok) throw new Error(json.error || `upload failed ${resp.status}`);
            resolve(json);
          } catch (err) {
            reject(err);
          }
        } else if (e.data?.type === "checkpoint-export-error") {
          settled = true;
          w4.removeEventListener("message", onMsg);
          reject(new Error(e.data.message || "checkpoint export failed"));
        }
      };
      w4.addEventListener("message", onMsg);
      if (controlView) {
        Atomics.store(controlView, 0, CMD_EXPORT_CHECKPOINT);
        Atomics.notify(controlView, 0);
        setTimeout(() => {
          if (!settled) w4.postMessage({ type: "export-checkpoint-live" });
        }, 15e3);
      } else {
        w4.postMessage({ type: "export-checkpoint-live" });
      }
      setTimeout(() => {
        settled = true;
        w4.removeEventListener("message", onMsg);
        reject(new Error("checkpoint export timeout"));
      }, 6e5);
    });
  }
  window._friscyExportLiveCheckpointUpload = exportLiveCheckpointUpload;
  var jitWarmupHudEl = document.getElementById("jit-warmup-hud");
  var jitHudCompiledEl = document.getElementById("jit-hud-compiled");
  var jitHudQueueEl = document.getElementById("jit-hud-queue");
  var jitHudMissEl = document.getElementById("jit-hud-miss");
  var jitHudPredictEl = document.getElementById("jit-hud-predict");
  var jitHudEnabled = true;
  var latestJitStats = null;
  var processEventLog = [];
  var processEventPanelEl = null;
  var processEventPanelEnabled = new URLSearchParams(window.location.search).has("procdebug") || new URLSearchParams(window.location.search).has("process_events");
  function kindToLabel(kind) {
    if (kind === 1) return "spawn";
    if (kind === 2) return "exit";
    if (kind === 3) return "wait_wakeup";
    return `kind(${kind})`;
  }
  function ensureProcessEventPanel() {
    if (!processEventPanelEnabled) return null;
    if (processEventPanelEl) return processEventPanelEl;
    const panel = document.createElement("div");
    panel.id = "friscy-process-events-overlay";
    panel.style.cssText = [
      "position:fixed",
      "right:12px",
      "top:12px",
      "width:360px",
      "max-height:220px",
      "overflow:auto",
      "z-index:9999",
      "background:#0f172a",
      "color:#93c5fd",
      "font-family:monospace",
      "font-size:11px",
      "padding:8px",
      "border:1px solid #334155",
      "border-radius:6px",
      "box-shadow:0 6px 24px rgba(0,0,0,0.35)"
    ].join(";");
    panel.innerHTML = '<div style="font-weight:600;margin-bottom:6px;color:#f8fafc">friscy process events</div><div id="friscy-process-events-list"></div>';
    document.body.appendChild(panel);
    processEventPanelEl = panel;
    return panel;
  }
  function appendProcessEvents(events) {
    processEventLog = processEventLog.concat(events || []).slice(-50);
    if (!processEventPanelEnabled) return;
    const panel = ensureProcessEventPanel();
    if (!panel) return;
    const list = panel.querySelector("#friscy-process-events-list");
    if (!list) return;
    const rows = [];
    for (const ev of processEventLog.slice(-12)) {
      const ts = new Date(ev.ts || Date.now()).toLocaleTimeString();
      rows.push(`${ts} ${ev.kindName || kindToLabel(ev.kind)} pid=${ev.pid} ppid=${ev.ppid} pgid=${ev.pgid} status=${ev.status || 0}`);
    }
    list.innerHTML = rows.map((r11) => `<div>${r11}</div>`).join("");
  }
  function formatPercent(value) {
    if (!Number.isFinite(value)) return "0.0%";
    return `${(value * 100).toFixed(1)}%`;
  }
  function updateJitWarmupHud(stats) {
    if (!jitWarmupHudEl) return;
    if (!jitHudEnabled || !stats) {
      jitWarmupHudEl.classList.remove("visible");
      return;
    }
    const compiled = Number.isFinite(stats.compiledRegionCount) ? stats.compiledRegionCount : 0;
    const queueDepth = Number.isFinite(stats.queueDepth) ? stats.queueDepth : 0;
    const missRate = Number.isFinite(stats.missRate) ? stats.missRate : Number.isFinite(stats.regionMisses) && Number.isFinite(stats.dispatchCalls) && stats.dispatchCalls > 0 ? stats.regionMisses / stats.dispatchCalls : 0;
    const predictorHitRate = Number.isFinite(stats.predictorHitRate) ? stats.predictorHitRate : 0;
    if (jitHudCompiledEl) jitHudCompiledEl.textContent = String(compiled);
    if (jitHudQueueEl) jitHudQueueEl.textContent = String(queueDepth);
    if (jitHudMissEl) jitHudMissEl.textContent = formatPercent(missRate);
    if (jitHudPredictEl) jitHudPredictEl.textContent = formatPercent(predictorHitRate);
    jitWarmupHudEl.classList.add("visible");
  }
  function handleWorkerRuntimeMessage(e) {
    const msg = e && e.data ? e.data : null;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "error") {
      console.error("[main] Worker runtime error:", msg.message);
      if (statusEl) statusEl.textContent = `Error: ${msg.message}`;
      return;
    }
    if (msg.type === "jit_stats") {
      latestJitStats = msg.stats || null;
      window.__friscyJitStats = latestJitStats;
      updateJitWarmupHud(latestJitStats);
    }
    if (msg.type === "checkpoint-exported-live") {
      if (statusEl) statusEl.textContent = "fast risc-v runtime for the browser & wasm";
      const blob = new Blob([msg.data], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const activeExample2 = new URLSearchParams(window.location.search).get("example") || "alpine";
      a.download = `${activeExample2}-snapshot.ckpt`;
      a.click();
      URL.revokeObjectURL(url);
    }
    if (msg.type === "checkpoint-export-error") {
      if (statusEl) statusEl.textContent = `Snapshot Error: ${msg.message}`;
    }
    if (msg.type === "process-events") {
      const now = Date.now();
      const events = (msg.events || []).map((ev) => ({ ...ev, ts: now }));
      window.__friscyProcessEvents = events;
      appendProcessEvents(events);
      window.__friscyProcessEventLog = processEventLog;
      console.debug("[friscy] process-events", events);
    }
  }
  function installWorkerRuntimeHandler() {
    if (worker) {
      worker.onmessage = handleWorkerRuntimeMessage;
    }
  }
  function readJitRuntimeConfig(params) {
    const parseIntParam = (name) => {
      const raw = params.get(name);
      if (raw === null) return null;
      const value = Number.parseInt(raw, 10);
      return Number.isFinite(value) ? value : null;
    };
    const parseFloatParam = (name) => {
      const raw = params.get(name);
      if (raw === null) return null;
      const value = Number.parseFloat(raw);
      return Number.isFinite(value) ? value : null;
    };
    const noPredict = params.has("nojitpredict");
    const cfg = {
      enableJit: !params.has("nojit"),
      jitHotThreshold: parseIntParam("jithot"),
      jitTierEnabled: !params.has("nojittier"),
      jitOptimizeThreshold: parseIntParam("jitopt"),
      jitTraceEnabled: !params.has("nojittrace") && !noPredict,
      jitEdgeHotThreshold: parseIntParam("jitedgehot"),
      jitTraceTripletHotThreshold: parseIntParam("jittrace3hot"),
      jitSchedulerBudget: parseFloatParam("jitbudget"),
      jitSchedulerConcurrency: parseIntParam("jitconcurrency"),
      jitSchedulerConcurrencyValue: parseIntParam("jitconcurrency"),
      jitSchedulerQueueMax: parseIntParam("jitqmax"),
      jitPredictTopK: parseIntParam("jitpredk"),
      jitPredictConfidence: parseFloatParam("jitpredconf"),
      jitMarkovEnabled: !params.has("nojitmarkov") && !noPredict,
      jitTripletEnabled: !params.has("nojittriplet") && !noPredict,
      jitAwaitCompiler: params.has("jitawait"),
      jitHudEnabled: !params.has("nojithud")
    };
    return cfg;
  }
  function updateNetStatus(state) {
    if (!netStatusEl) return;
    netStatusEl.className = "net-status " + state;
    const labels = { connected: "net: on", disconnected: "net: off", connecting: "net: ..." };
    netStatusEl.textContent = labels[state] || state;
  }
  function updateTerminalSize() {
    if (term && fitAddon) {
      fitAddon.fit();
      if (worker) {
        worker.postMessage({ type: "resize", rows: term.rows, cols: term.cols });
      }
    }
    if (term2 && fitAddon2) {
      fitAddon2.fit();
      if (worker2) {
        worker2.postMessage({ type: "resize", rows: term2.rows, cols: term2.cols });
      }
    }
  }
  function drainStdout() {
    if (!stdoutView || !stdoutBytes || !term) return;
    const writeHead = Atomics.load(stdoutView, 0);
    const readTail = Atomics.load(stdoutView, 1);
    if (writeHead === readTail) return;
    let available;
    if (writeHead >= readTail) {
      available = writeHead - readTail;
    } else {
      available = RING_SIZE - readTail + writeHead;
    }
    if (available <= 0) return;
    const buf = new Uint8Array(available);
    let pos = readTail;
    for (let i8 = 0; i8 < available; i8++) {
      buf[i8] = stdoutBytes[RING_HEADER + pos];
      pos = (pos + 1) % RING_SIZE;
    }
    Atomics.store(stdoutView, 1, pos);
    const copied = new Uint8Array(buf.length);
    copied.set(buf);
    const text = new TextDecoder().decode(copied);
    term.write(text);
  }
  function checkStdinRequest() {
    if (!controlView || !controlSab) return;
    const cmd = Atomics.load(controlView, 0);
    if (cmd !== CMD_STDIN_REQUEST) return;
    if (stdinQueue.length === 0) return;
    const maxLen = Atomics.load(controlView, 2);
    const controlBytes = new Uint8Array(controlSab);
    const toSend = Math.min(stdinQueue.length, maxLen, 3968);
    for (let i8 = 0; i8 < toSend; i8++) {
      controlBytes[64 + i8] = stdinQueue.shift();
    }
    Atomics.store(controlView, 2, toSend);
    Atomics.store(controlView, 0, CMD_STDIN_READY);
    Atomics.notify(controlView, 0);
  }
  function checkExit() {
    if (!controlView || !term || !statusEl) return false;
    const cmd = Atomics.load(controlView, 0);
    if (cmd === CMD_EXIT) {
      machineRunning = false;
      const exitCode = Atomics.load(controlView, 5);
      term.writeln(`
\x1B[33mProcess exited (code ${exitCode})\x1B[0m`);
      statusEl.textContent = `Exited (${exitCode})`;
      Atomics.store(controlView, 0, CMD_IDLE);
      return true;
    }
    return false;
  }
  var overlayEl = document.getElementById("progress-overlay");
  var stageEl = document.getElementById("progress-stage");
  var detailEl = document.getElementById("progress-detail");
  var waveCanvas = document.getElementById("progress-canvas");
  var waveCtx = waveCanvas?.getContext("2d");
  var wavePct = 0;
  var waveTarget = 0;
  var waveIndeterminate = false;
  var waveAnimId = null;
  var waveMode = "squiggly";
  var SQ_WAVE_LENGTH = 32;
  var SQ_LINE_AMP = 3;
  var SQ_PHASE_SPEED = 8;
  var SQ_STROKE_W = 6;
  var SQ_TRANSITION_PERIODS = 1.5;
  var SQ_DISABLED_ALPHA = 0.25;
  var SQ_TWO_PI = Math.PI * 2;
  var SINE_WAVE_LENGTH = 40;
  var SINE_AMP = 4;
  var SINE_PHASE_SPEED = 60;
  var SINE_STROKE_W = 3;
  var SINE_STEP = 2;
  var FILL_COLOR = "#2ea043";
  var WARN_COLOR = "#d29922";
  var ERR_COLOR = "#e06c75";
  var waveColor = null;
  var heightFraction = 1;
  var sqPhaseOffset = 0;
  var sqLastTime = -1;
  var demoActive = false;
  function setupCanvasDPI(canvas, ctx) {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW > 0 && cssH > 0) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.scale(dpr, dpr);
    }
  }
  if (waveCanvas && waveCtx) setupCanvasDPI(waveCanvas, waveCtx);
  function lerpInvSat(a, b, v3) {
    return Math.max(0, Math.min(1, (v3 - a) / (b - a)));
  }
  function buildWavePath(waveStart, waveEnd, waveProgressPx, transitionEnabled) {
    const path = new Path2D();
    path.moveTo(waveStart, 0);
    let currentX = waveStart;
    let waveSign = 1;
    const dist = SQ_WAVE_LENGTH / 2;
    function computeAmp(x, sign) {
      if (transitionEnabled) {
        const length = SQ_TRANSITION_PERIODS * SQ_WAVE_LENGTH;
        const coeff = lerpInvSat(
          waveProgressPx + length / 2,
          waveProgressPx - length / 2,
          x
        );
        return sign * heightFraction * SQ_LINE_AMP * coeff;
      }
      return sign * heightFraction * SQ_LINE_AMP;
    }
    let currentAmp = computeAmp(currentX, waveSign);
    while (currentX < waveEnd) {
      waveSign = -waveSign;
      const nextX = currentX + dist;
      const midX = currentX + dist / 2;
      const nextAmp = computeAmp(nextX, waveSign);
      path.bezierCurveTo(midX, currentAmp, midX, nextAmp, nextX, nextAmp);
      currentAmp = nextAmp;
      currentX = nextX;
    }
    return path;
  }
  function drawSineProgress(ctx, W3, H5, now, progress, color) {
    const midY = H5 / 2;
    const amp = SINE_AMP;
    const wl = SINE_WAVE_LENGTH;
    const sw = SINE_STROKE_W;
    const step = SINE_STEP;
    const phase = now / 1e3 * SINE_PHASE_SPEED;
    const totalProgressPx = W3 * progress;
    ctx.save();
    ctx.translate(0, midY);
    if (totalProgressPx < W3) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = SQ_DISABLED_ALPHA;
      ctx.lineWidth = sw;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(totalProgressPx, 0);
      ctx.lineTo(W3, 0);
      ctx.stroke();
      ctx.restore();
    }
    if (totalProgressPx > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, -(amp + sw), totalProgressPx, (amp + sw) * 2);
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 1;
      ctx.lineWidth = sw;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let x = 0; x <= W3; x += step) {
        const y = Math.sin(SQ_TWO_PI * (x - phase) / wl) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawSineIndeterminate(ctx, W3, H5, now, color) {
    const midY = H5 / 2;
    const amp = SINE_AMP;
    const wl = SINE_WAVE_LENGTH;
    const sw = SINE_STROKE_W;
    const step = SINE_STEP;
    const phase = now / 1e3 * SINE_PHASE_SPEED;
    const fakeProgress = 1;
    const totalProgressPx = W3 * fakeProgress;
    ctx.save();
    ctx.translate(0, midY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(totalProgressPx, -(amp + sw), W3 - totalProgressPx, (amp + sw) * 2);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.globalAlpha = SQ_DISABLED_ALPHA;
    ctx.lineWidth = sw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let x = 0; x <= W3; x += step) {
      const y = Math.sin(SQ_TWO_PI * (x - phase) / wl) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, -(amp + sw), totalProgressPx, (amp + sw) * 2);
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = sw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let x = 0; x <= W3; x += step) {
      const y = Math.sin(SQ_TWO_PI * (x - phase) / wl) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
  function drawSquigglyProgress(ctx, W3, H5, _now, progress, color) {
    const midY = H5 / 2;
    const totalProgressPx = W3 * progress;
    const waveStart = -sqPhaseOffset - SQ_WAVE_LENGTH / 2;
    const path = buildWavePath(waveStart, totalProgressPx + SQ_WAVE_LENGTH, totalProgressPx, false);
    ctx.save();
    ctx.translate(0, midY);
    if (totalProgressPx < W3) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = SQ_DISABLED_ALPHA;
      ctx.lineWidth = SQ_STROKE_W;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(totalProgressPx, 0);
      ctx.lineTo(W3, 0);
      ctx.stroke();
      ctx.restore();
    }
    if (totalProgressPx > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        0,
        -(SQ_LINE_AMP + SQ_STROKE_W),
        totalProgressPx,
        (SQ_LINE_AMP + SQ_STROKE_W) * 2
      );
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 1;
      ctx.lineWidth = SQ_STROKE_W;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(path);
      ctx.restore();
    }
    const startAmp = Math.cos(Math.abs(waveStart) / SQ_WAVE_LENGTH * SQ_TWO_PI);
    ctx.beginPath();
    ctx.arc(
      0,
      startAmp * SQ_LINE_AMP * heightFraction,
      SQ_STROKE_W / 2,
      0,
      SQ_TWO_PI
    );
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
  function drawSquigglyIndeterminate(ctx, W3, H5, _now, color) {
    const midY = H5 / 2;
    const fakeProgress = 1;
    const totalProgressPx = W3 * fakeProgress;
    const waveStart = -sqPhaseOffset - SQ_WAVE_LENGTH / 2;
    const path = buildWavePath(waveStart, W3, totalProgressPx, true);
    ctx.save();
    ctx.translate(0, midY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      totalProgressPx,
      -(SQ_LINE_AMP + SQ_STROKE_W),
      W3 - totalProgressPx,
      (SQ_LINE_AMP + SQ_STROKE_W) * 2
    );
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.globalAlpha = SQ_DISABLED_ALPHA;
    ctx.lineWidth = SQ_STROKE_W;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(path);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      0,
      -(SQ_LINE_AMP + SQ_STROKE_W),
      totalProgressPx,
      (SQ_LINE_AMP + SQ_STROKE_W) * 2
    );
    ctx.clip();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 1;
    ctx.lineWidth = SQ_STROKE_W;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke(path);
    ctx.restore();
    ctx.restore();
  }
  function ensureCanvasDPI(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    const pixW = Math.round(cssW * dpr);
    const pixH = Math.round(cssH * dpr);
    if (pixW > 0 && pixH > 0 && (canvas.width !== pixW || canvas.height !== pixH)) {
      canvas.width = pixW;
      canvas.height = pixH;
      ctx.scale(dpr, dpr);
    }
    return { W: cssW, H: cssH };
  }
  function drawWave(timestamp) {
    const now = timestamp || performance.now();
    if (!demoActive && !waveIndeterminate) {
      wavePct += (waveTarget - wavePct) * 0.12;
    }
    if (sqLastTime < 0) sqLastTime = now;
    const dt2 = (now - sqLastTime) / 1e3;
    sqPhaseOffset += dt2 * SQ_PHASE_SPEED;
    sqPhaseOffset %= SQ_WAVE_LENGTH;
    sqLastTime = now;
    const color = waveColor || FILL_COLOR;
    const progress = wavePct / 100;
    if (waveCanvas && waveCtx) {
      const { W: W3, H: H5 } = ensureCanvasDPI(waveCanvas, waveCtx);
      waveCtx.clearRect(0, 0, W3, H5);
      if (waveIndeterminate) {
        if (waveMode === "sine") drawSineIndeterminate(waveCtx, W3, H5, now, color);
        else drawSquigglyIndeterminate(waveCtx, W3, H5, now, color);
      } else {
        if (waveMode === "sine") drawSineProgress(waveCtx, W3, H5, now, progress, color);
        else drawSquigglyProgress(waveCtx, W3, H5, now, progress, color);
      }
    }
    if (waveAnimId !== null) {
      cancelAnimationFrame(waveAnimId);
    }
    waveAnimId = requestAnimationFrame(drawWave);
  }
  if (waveAnimId !== null) {
    cancelAnimationFrame(waveAnimId);
  }
  waveAnimId = requestAnimationFrame(drawWave);
  function setProgress(pct, stage, detail) {
    if (stage && stageEl) stageEl.textContent = stage;
    if (pct < 0) {
      waveIndeterminate = true;
    } else {
      waveIndeterminate = false;
      wavePct = pct;
    }
    if (detailEl) detailEl.textContent = detail || "\xA0";
  }
  function formatBytes(bytes) {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }
  var STALL_TIMEOUT_MS = 1e4;
  var MAX_RETRIES = 5;
  var RETRY_DELAYS = [1e3, 2e3, 4e3, 8e3, 15e3];
  async function fetchWithProgress(url) {
    let total = 0;
    const chunks = [];
    let loaded = 0;
    let retries = 0;
    const startTime = performance.now();
    while (true) {
      try {
        const headers = {};
        if (loaded > 0) {
          headers["Range"] = `bytes=${loaded}-`;
        }
        waveColor = null;
        const resp = await fetch(url, { headers });
        if (!resp.ok && resp.status !== 206) {
          throw new Error(`HTTP ${resp.status}`);
        }
        if (total === 0) {
          if (resp.status === 206) {
            const range = resp.headers.get("Content-Range");
            if (range) total = parseInt(range.split("/")[1], 10) || 0;
          } else {
            total = parseInt(resp.headers.get("Content-Length") || "0", 10) || 0;
          }
        }
        if (!resp.body) {
          const buf = await resp.arrayBuffer();
          setProgress(100, null, formatBytes(buf.byteLength) + " downloaded");
          return buf;
        }
        const reader = resp.body.getReader();
        retries = 0;
        if (loaded > 0) {
          waveColor = null;
          setProgress(
            total ? Math.round(loaded / total * 100) : -1,
            `Downloading (resumed)...`,
            void 0
          );
        }
        while (true) {
          const readPromise = reader.read();
          const timeoutPromise = new Promise(
            (_4, reject) => setTimeout(() => reject(new Error("stall")), STALL_TIMEOUT_MS)
          );
          let result2;
          try {
            result2 = await Promise.race([readPromise, timeoutPromise]);
          } catch (e) {
            try {
              reader.cancel();
            } catch (_se) {
            }
            waveColor = WARN_COLOR;
            setProgress(
              total ? Math.round(loaded / total * 100) : -1,
              null,
              "Download stalled, retrying..."
            );
            throw e;
          }
          const { done, value } = result2;
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          const pct = total ? Math.min(99, Math.round(loaded / total * 100)) : -1;
          const elapsed = (performance.now() - startTime) / 1e3;
          const speed = elapsed > 0 ? loaded / elapsed : 0;
          setProgress(
            pct,
            null,
            `${formatBytes(loaded)} / ${total ? formatBytes(total) : "?"}  \u2022  ${formatBytes(speed)}/s`
          );
        }
        break;
      } catch (err) {
        retries++;
        if (retries > MAX_RETRIES) {
          waveColor = ERR_COLOR;
          setProgress(
            total ? Math.round(loaded / total * 100) : 0,
            "Download failed",
            `${err.message} \u2014 reload to retry`
          );
          throw new Error(`Download failed after ${MAX_RETRIES} retries: ${err.message}`, { cause: err });
        }
        const delay = RETRY_DELAYS[Math.min(retries - 1, RETRY_DELAYS.length - 1)];
        waveColor = WARN_COLOR;
        for (let remaining = Math.ceil(delay / 1e3); remaining > 0; remaining--) {
          setProgress(
            total ? Math.round(loaded / total * 100) : 0,
            null,
            `Connection lost \u2014 retrying in ${remaining}s (attempt ${retries}/${MAX_RETRIES})`
          );
          await new Promise((r11) => setTimeout(r11, 1e3));
        }
        setProgress(
          total ? Math.round(loaded / total * 100) : 0,
          null,
          `Reconnecting... (attempt ${retries}/${MAX_RETRIES})`
        );
      }
    }
    const result = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    waveColor = null;
    setProgress(100, null, formatBytes(loaded) + " downloaded");
    return result.buffer;
  }
  async function main() {
    const netStatusHTML = (document.getElementById("net-status") || { outerHTML: "" }).outerHTML;
    if (typeof SharedArrayBuffer === "undefined") {
      if (statusEl) statusEl.textContent = "Error: SharedArrayBuffer not available";
      if (stageEl) stageEl.textContent = "Cross-origin isolation required";
      if (detailEl) detailEl.textContent = "Serve with COOP/COEP headers (use serve.js)";
      return;
    }
    if (activeExample === "import") {
      if (overlayEl) overlayEl.style.display = "none";
      document.getElementById("import-panel")?.classList.add("visible");
      if (statusEl) statusEl.textContent = "Import";
      if (typeof initImportPanel === "function") initImportPanel();
      return;
    }
    setProgress(-1, "Loading manifest...", void 0);
    const manifest = await fetch("./manifest.json").then((r11) => r11.json());
    const exampleCfg = activeExample && manifest.examples && manifest.examples[activeExample] || {};
    const imageName = exampleCfg.image || manifest.image;
    const rootfsUrl = exampleCfg.rootfs || manifest.rootfs || "./rootfs.tar";
    if (statusEl) statusEl.textContent = `Loading ${imageName}...`;
    setProgress(0, `Loading ${imageName}...`, "Starting download...");
    let companionRootfs = null;
    let rootfs;
    if (activeExample === "server") {
      const results = await Promise.all([
        fetchWithProgress(rootfsUrl),
        fetch("./rootfs.tar").then((r11) => r11.arrayBuffer())
      ]);
      rootfs = results[0];
      companionRootfs = results[1];
    } else {
      rootfs = await fetchWithProgress(rootfsUrl);
    }
    let checkpointData = null;
    const checkpointUrl = exampleCfg.checkpoint;
    if (checkpointUrl) {
      try {
        const resp = await fetch(checkpointUrl);
        if (resp.ok) {
          checkpointData = await resp.arrayBuffer();
          console.log(`[friscy] Checkpoint loaded: ${(checkpointData.byteLength / 1048576).toFixed(1)} MB`);
        }
      } catch (e) {
        console.warn("[friscy] Checkpoint load failed:", e);
      }
    }
    setProgress(-1, "Initializing runtime...", void 0);
    const isDual = activeExample === "server";
    const primaryTermEl = isDual ? document.getElementById("terminal-server") : terminalEl;
    if (!primaryTermEl) return;
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const isNarrow = window.innerWidth < 800;
    const termOptions = {
      cursorBlink: true,
      cursorStyle: "bar",
      cursorInactiveStyle: "outline",
      cursorWidth: 2,
      convertEol: true,
      allowProposedApi: true,
      fontSize: isMobile ? 13 : isNarrow ? 14 : 16,
      fontFamily: '"Maple Mono", "Cascadia Code", "Fira Code", Menlo, Monaco, monospace',
      fontWeight: "400",
      fontWeightBold: "700",
      lineHeight: 1.25,
      letterSpacing: 0,
      scrollback: 5e4,
      smoothScrollDuration: 80,
      minimumContrastRatio: 4.5,
      customGlyphs: true,
      rescaleOverlappingGlyphs: true,
      drawBoldTextInBrightColors: false,
      altClickMovesCursor: true,
      scrollOnUserInput: true,
      scrollToBottomOnInput: true,
      rightClickSelectsWord: true,
      macOptionIsMeta: true,
      macOptionClickForcesSelection: true,
      overviewRulerWidth: 14,
      theme: FRISCY_THEME,
      copyOnSelect: true,
      bellStyle: "none",
      screenReaderMode: false
    };
    term = new import_xterm.Terminal(termOptions);
    window._friscyTerm = term;
    fitAddon = new o();
    term.loadAddon(fitAddon);
    try {
      const webgl = new xr();
      webgl.onContextLoss(() => {
        webgl.dispose();
      });
      term.loadAddon(webgl);
    } catch (_e3) {
      console.warn("[xterm] WebGL2 not available, using canvas renderer");
    }
    term.loadAddon(new L((_e3, uri) => {
      window.open(uri, "_blank", "noopener");
    }, {
      hover: (_e3, uri) => {
        primaryTermEl.style.cursor = "pointer";
        primaryTermEl.title = uri;
        if (_e3.target) _e3.target.style.textDecoration = "underline";
      },
      leave: (_e3, _uri) => {
        primaryTermEl.style.cursor = "";
        primaryTermEl.title = "";
        if (_e3.target) _e3.target.style.textDecoration = "";
      }
    }));
    try {
      const imageAddon = new it3({
        enableSizeReports: true,
        pixelLimit: 16777216,
        sixelSupport: true,
        sixelScrolling: true,
        sixelPaletteLimit: 4096,
        iipSupport: true,
        storageLimit: 128
      });
      term.loadAddon(imageAddon);
    } catch (e) {
      console.warn("[xterm] Image addon not available:", e.message);
    }
    const unicode11 = new Ke();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";
    const searchAddon = new ut();
    term.loadAddon(searchAddon);
    setupDragDrop(primaryTermEl, term);
    setupClipboard(term);
    function debounce(fn2, ms2) {
      let id;
      return (...args2) => {
        clearTimeout(id);
        id = setTimeout(() => fn2(...args2), ms2);
      };
    }
    const debouncedFit = debounce(updateTerminalSize, 150);
    window.addEventListener("resize", debouncedFit);
    window.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "=") {
        e.preventDefault();
        term.options.fontSize = Math.min(32, (term.options.fontSize || 14) + 1);
        fitAddon.fit();
      } else if (e.ctrlKey && e.key === "-") {
        e.preventDefault();
        term.options.fontSize = Math.max(8, (term.options.fontSize || 14) - 1);
        fitAddon.fit();
      }
    });
    primaryTermEl.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (text) term.paste(text);
        }).catch(() => {
        });
      }
    });
    const snapshotBtn = document.getElementById("snapshot-btn");
    if (snapshotBtn) {
      snapshotBtn.addEventListener("click", () => {
        if (!machineRunning || !worker) return;
        if (statusEl) statusEl.textContent = "Saving memory snapshot...";
        if (controlView) {
          Atomics.store(controlView, 0, CMD_EXPORT_CHECKPOINT);
          Atomics.notify(controlView, 0);
        } else {
          worker.postMessage({ type: "export-checkpoint-live" });
        }
      });
    }
    const exportEventsBtn = document.getElementById("export-events-btn");
    if (exportEventsBtn) {
      exportEventsBtn.addEventListener("click", () => {
        const payload = {
          ts: (/* @__PURE__ */ new Date()).toISOString(),
          url: location.href,
          processEvents: window.__friscyProcessEventLog || processEventLog || []
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `friscy-process-proof-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        if (statusEl) statusEl.textContent = "Process event proof exported";
      });
    }
    controlSab = new SharedArrayBuffer(4096);
    stdoutSab = new SharedArrayBuffer(65536);
    netSab = new SharedArrayBuffer(65536);
    controlView = new Int32Array(controlSab);
    stdoutView = new Int32Array(stdoutSab);
    stdoutBytes = new Uint8Array(stdoutSab);
    window._friscyControlView = controlView;
    setProgress(-1, "Starting worker...", void 0);
    worker = new Worker("./worker.js", { type: "module" });
    const workerReady = new Promise((resolve, reject) => {
      if (!worker) return reject();
      const onMsg = (e) => {
        if (e.data.type === "ready") {
          resolve(void 0);
          if (worker) worker.onmessage = null;
        }
        if (e.data.type === "error") reject(new Error(`Worker: ${e.data.message}`));
      };
      worker.onmessage = onMsg;
      worker.onerror = (e) => {
        const detail = e.message || `${e.filename || "worker.js"}:${e.lineno || "?"}`;
        console.error("[main] Worker error:", detail, e);
        reject(new Error(`Worker failed: ${detail}`));
      };
    });
    const runtimeParams = new URLSearchParams(location.search);
    const jitCfg = readJitRuntimeConfig(runtimeParams);
    const allowNetwork = runtimeParams.get("allowNetwork") !== "0";
    const hostFetchProxy = runtimeParams.get("hostFetchProxy") || `${window.location.origin}/__host_fetch`;
    jitHudEnabled = jitCfg.jitHudEnabled;
    if (!jitHudEnabled && jitWarmupHudEl) {
      jitWarmupHudEl.classList.remove("visible");
    }
    worker.postMessage({
      type: "init",
      controlSab,
      stdoutSab,
      netSab,
      enableJit: jitCfg.enableJit,
      jitHotThreshold: jitCfg.jitHotThreshold,
      jitTierEnabled: jitCfg.jitTierEnabled,
      jitOptimizeThreshold: jitCfg.jitOptimizeThreshold,
      jitTraceEnabled: jitCfg.jitTraceEnabled,
      jitEdgeHotThreshold: jitCfg.jitEdgeHotThreshold,
      jitTraceTripletHotThreshold: jitCfg.jitTraceTripletHotThreshold,
      jitSchedulerBudget: jitCfg.jitSchedulerBudget,
      jitSchedulerConcurrency: jitCfg.jitSchedulerConcurrency,
      jitSchedulerQueueMax: jitCfg.jitSchedulerQueueMax,
      jitPredictTopK: jitCfg.jitPredictTopK,
      jitPredictConfidence: jitCfg.jitPredictConfidence,
      jitMarkovEnabled: jitCfg.jitMarkovEnabled,
      jitTripletEnabled: jitCfg.jitTripletEnabled,
      jitAwaitCompiler: jitCfg.jitAwaitCompiler,
      allowNetwork,
      hostFetchProxy
    });
    await workerReady;
    installWorkerRuntimeHandler();
    updateNetStatus("connected JSPI");
    overlayEl?.classList.add("hidden");
    if (isDual) {
      document.getElementById("dual-terminal-container")?.classList.add("active");
    } else {
      if (terminalEl) terminalEl.style.display = "flex";
    }
    const resetBtn = document.getElementById("reset-btn");
    if (resetBtn) resetBtn.style.display = "block";
    term.open(primaryTermEl);
    primaryTermEl.addEventListener("click", () => term.focus());
    fitAddon.fit();
    Atomics.store(controlView, 6, term.cols);
    Atomics.store(controlView, 7, term.rows);
    term.focus();
    requestAnimationFrame(() => updateTerminalSize());
    const rootfsMB = (rootfs.byteLength / 1024 / 1024).toFixed(1);
    term.writeln("\x1B[4:3m\x1B[58;2;255;0;255mdocker-in-browser\x1B[0m");
    term.writeln("");
    term.writeln("\x1B[1;32mfriscy\x1B[0m fast risc-v runtime for the browser & wasm");
    term.writeln(`Image: ${manifest.image} (${rootfsMB} MB)`);
    term.writeln("\x1B[32mNetwork: VectorHeart (JSPI)\x1B[0m");
    term.writeln("");
    const SIXEL_IMAGE_DATA = '\x1BPq"1;1;10;10#0;2;0;0;0#1;2;100;0;0#0!10~#1!10~#2!10~#1!10~#0!10~#1!10~#2!10~#1!10~#0!10~#1!10~\x1B';
    term.writeln("Type 'sixel' to display a Sixel image.");
    term.onData((data) => {
      if (data.trim() === "sixel") {
        term.write(SIXEL_IMAGE_DATA);
      }
    });
    const searchBarEl = document.getElementById("search-bar");
    const searchInputEl = document.getElementById("search-input");
    function openSearch() {
      searchBarEl?.classList.add("visible");
      searchInputEl?.focus();
      searchInputEl?.select();
    }
    function closeSearch() {
      searchBarEl?.classList.remove("visible");
      searchAddon.clearDecorations();
      term.focus();
    }
    searchInputEl?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && ev.shiftKey) {
        searchAddon.findPrevious(searchInputEl.value);
        ev.preventDefault();
      } else if (ev.key === "Enter") {
        searchAddon.findNext(searchInputEl.value);
        ev.preventDefault();
      } else if (ev.key === "Escape") {
        closeSearch();
        ev.preventDefault();
      }
    });
    searchInputEl?.addEventListener("input", () => {
      if (searchInputEl.value) searchAddon.findNext(searchInputEl.value);
    });
    document.getElementById("search-prev")?.addEventListener("click", () => searchAddon.findPrevious(searchInputEl.value));
    document.getElementById("search-next")?.addEventListener("click", () => searchAddon.findNext(searchInputEl.value));
    document.getElementById("search-close")?.addEventListener("click", closeSearch);
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type === "keydown" && ev.ctrlKey && ev.shiftKey && ev.key === "F") {
        openSearch();
        return false;
      }
      if (ev.type === "keydown" && ev.ctrlKey && ev.key === "c" && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      if (ev.type === "keydown" && ev.ctrlKey && ev.key === "v") {
        navigator.clipboard.readText().then((text) => {
          if (text) term.paste(text);
        }).catch(() => {
        });
        return false;
      }
      if (ev.key === "Tab") {
        ev.preventDefault();
        return true;
      }
      return true;
    });
    term.onData((data) => {
      if (!machineRunning) return;
      for (let i8 = 0; i8 < data.length; i8++) {
        const code = data.charCodeAt(i8);
        if (code === 3) {
          stdinQueue.push(3);
        } else if (code === 26) {
          stdinQueue.push(26);
        } else if (code === 12) {
          term.clear();
          stdinQueue.push(12);
        } else if (code === 4) {
          stdinQueue.push(4);
        } else if (data[i8] === "\r") {
          stdinQueue.push(10);
        } else if (code === 127) {
          stdinQueue.push(127);
        } else if (code === 27) {
          const bytes = new TextEncoder().encode(data.slice(i8));
          stdinQueue.push(...Array.from(bytes));
          break;
        } else {
          const bytes = new TextEncoder().encode(data[i8]);
          stdinQueue.push(...Array.from(bytes));
        }
      }
      checkStdinRequest();
    });
    const pollTimer = setInterval(() => {
      drainStdout();
      checkStdinRequest();
      if (checkExit()) {
        clearInterval(pollTimer);
      }
    }, 4);
    const entrypoint = exampleCfg.entrypoint || manifest.entrypoint;
    let guestCmd = Array.isArray(entrypoint) ? [...entrypoint] : entrypoint.split(" ").filter((s) => s);
    const commandOverride = runtimeParams.get("cmd");
    if (commandOverride) {
      guestCmd = ["/bin/sh", "-lc", commandOverride];
    }
    if (guestCmd.length === 1 && (guestCmd[0] === "/bin/bash" || guestCmd[0] === "bash")) {
      guestCmd.push("-i");
    }
    const defaultEnv = manifest.env || [];
    const exampleEnv = exampleCfg.env || [];
    const envMap = /* @__PURE__ */ new Map();
    for (const e of defaultEnv) {
      const k4 = e.split("=")[0];
      envMap.set(k4, e);
    }
    for (const e of exampleEnv) {
      const k4 = e.split("=")[0];
      envMap.set(k4, e);
    }
    const hostFetchBridge = `${window.location.protocol}//127.0.0.1:${window.location.port || "80"}/__host_fetch`;
    envMap.set("FRISCY_HOST_FETCH", `FRISCY_HOST_FETCH=${hostFetchBridge}`);
    const envVars = [...envMap.values()];
    const envArgs = envVars.flatMap((e) => ["--env", e]);
    const args = [...envArgs, "--rootfs", "/rootfs.tar", ...guestCmd];
    if (statusEl) statusEl.textContent = "Booting...";
    setProgress(100, `Booting ${imageName}...`, "Initializing RISC-V interpreter engine...");
    await new Promise((resolve) => requestAnimationFrame(resolve));
    machineRunning = true;
    const rootfsArray = new Uint8Array(rootfs);
    const msg = {
      type: "run",
      args,
      rootfsData: rootfsArray.buffer
    };
    const transfers = [rootfsArray.buffer];
    if (checkpointData) {
      const ckptArray = new Uint8Array(checkpointData);
      msg.checkpointData = ckptArray.buffer;
      transfers.push(ckptArray.buffer);
    }
    worker.postMessage(msg, transfers);
    setTimeout(() => {
      if (overlayEl) overlayEl.style.display = "none";
      primaryTermEl.style.display = "block";
      if (isDual) document.getElementById("terminal-companion").style.display = "block";
      fitAddon.fit();
    }, 1500);
    if (statusEl) statusEl.innerHTML = "fast risc-v runtime for the browser &amp; wasm" + netStatusHTML;
    if (activeExample === "server" && companionRootfs) {
      if (typeof bootCompanion === "function") bootCompanion(companionRootfs, window.proxyUrl).then(() => window.runAutoWget?.());
    }
    if (activeExample === "alpine") {
      const waitForShell = () => {
        if (controlView && Atomics.load(controlView, 0) === 1) {
          const cmd = "uname -a\n";
          for (let i8 = 0; i8 < cmd.length; i8++) {
            stdinQueue.push(cmd.charCodeAt(i8));
          }
          checkStdinRequest();
        } else {
          setTimeout(waitForShell, 200);
        }
      };
      setTimeout(waitForShell, 1e3);
    }
  }
  var pageParams = new URLSearchParams(location.search);
  var activeExample = pageParams.get("example") || "alpine";
  main().catch((err) => {
    console.error("[main] startup failed:", err);
    if (statusEl) statusEl.textContent = "Error: startup failed";
    if (stageEl) stageEl.textContent = "Initialization failed";
    if (detailEl) detailEl.textContent = err?.message || String(err);
  });
  document.querySelectorAll(".tab").forEach((tab) => {
    if (tab.dataset.example === activeExample) tab.classList.add("active");
    else tab.classList.remove("active");
  });
  function switchExample(name) {
    const u = new URL(location.href);
    if (name === "alpine") u.searchParams.delete("example");
    else u.searchParams.set("example", name);
    location.href = u.toString();
  }
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchExample(tab.dataset.example));
  });
  document.getElementById("reset-btn")?.addEventListener("click", () => location.reload());
  var POPULAR_IMAGES = [
    "ubuntu",
    "alpine",
    "debian",
    "busybox",
    "centos",
    "fedora",
    "archlinux",
    "amazonlinux",
    "oraclelinux",
    "rockylinux",
    "almalinux",
    "clearlinux",
    "node",
    "python",
    "ruby",
    "rust",
    "golang",
    "openjdk",
    "eclipse-temurin",
    "amazoncorretto",
    "php",
    "perl",
    "erlang",
    "elixir",
    "swift",
    "dart",
    "julia",
    "haskell",
    "clojure",
    "groovy",
    "scala",
    "dotnet/sdk",
    "dotnet/runtime",
    "nginx",
    "httpd",
    "caddy",
    "traefik",
    "haproxy",
    "envoyproxy/envoy",
    "postgres",
    "mysql",
    "mariadb",
    "mongo",
    "redis",
    "memcached",
    "cassandra",
    "couchdb",
    "neo4j",
    "influxdb",
    "clickhouse/clickhouse-server",
    "timescale/timescaledb",
    "rabbitmq",
    "nats",
    "mosquitto",
    "kafka",
    "elasticsearch",
    "kibana",
    "logstash",
    "grafana/grafana",
    "prom/prometheus",
    "prom/alertmanager",
    "vault",
    "consul",
    "etcd",
    "docker",
    "docker/compose",
    "registry",
    "portainer/portainer-ce",
    "jenkins/jenkins",
    "gitlab/gitlab-ce",
    "gitea/gitea",
    "drone/drone",
    "sonarqube",
    "nextcloud",
    "wordpress",
    "ghost",
    "mediawiki",
    "drupal",
    "joomla",
    "minio/minio",
    "rclone/rclone",
    "ubuntu:22.04",
    "ubuntu:24.04",
    "ubuntu:latest",
    "debian:bookworm",
    "debian:bullseye",
    "alpine:3.19",
    "alpine:3.20",
    "alpine:edge",
    "node:22",
    "node:20",
    "node:lts",
    "node:alpine",
    "python:3.12",
    "python:3.11",
    "python:slim",
    "python:alpine",
    "rust:latest",
    "rust:slim",
    "rust:alpine",
    "golang:1.22",
    "golang:1.21",
    "golang:alpine",
    "nginx:alpine",
    "nginx:latest",
    "redis:alpine",
    "redis:latest",
    "postgres:16",
    "postgres:15",
    "postgres:alpine",
    "mongo:7",
    "mongo:6",
    "mysql:8",
    "mariadb:11",
    "mariadb:10",
    "gcc",
    "cmake",
    "maven",
    "gradle",
    "composer",
    "pip",
    "cargo",
    "npm",
    "curl",
    "wget",
    "git",
    "openssh-server",
    "openssl",
    "bash",
    "zsh",
    "fish",
    "tmux",
    "vim",
    "neovim",
    "emacs",
    "ubuntu:20.04",
    "ubuntu:18.04",
    "centos:7",
    "fedora:39",
    "fedora:40"
  ];
  function initImportPanel() {
    const input = document.getElementById("import-input");
    const chip = document.getElementById("import-chip");
    const ac = document.getElementById("import-ac");
    const goBtn = document.getElementById("import-go-btn");
    const statusDiv = document.getElementById("import-status");
    const importCanvas = document.getElementById("import-progress-canvas");
    const importCtx = importCanvas?.getContext("2d");
    let importProgress = 0;
    let importAnimId = null;
    const PINK = "#f9a8d4";
    function drawImportProgress() {
      if (!importCanvas || !importCtx) return;
      const { W: W3, H: H5 } = ensureCanvasDPI(importCanvas, importCtx);
      importCtx.clearRect(0, 0, W3, H5);
      if (importProgress < 0) {
        drawSquigglyIndeterminate(importCtx, W3, H5, performance.now(), PINK);
      } else {
        drawSquigglyProgress(importCtx, W3, H5, performance.now(), importProgress, PINK);
      }
      importAnimId = requestAnimationFrame(drawImportProgress);
    }
    let selectedIdx = -1;
    let filtered = [];
    function updateChip() {
      chip?.classList.toggle("hidden", input.value.length > 0 || document.activeElement === input);
    }
    input?.addEventListener("focus", () => {
      chip?.classList.add("hidden");
    });
    input?.addEventListener("blur", () => {
      setTimeout(updateChip, 150);
    });
    input?.addEventListener("input", () => {
      updateChip();
      updateAutocomplete();
    });
    chip?.addEventListener("click", () => {
      input.value = "ubuntu:latest";
      chip.classList.add("hidden");
      input.focus();
      updateAutocomplete();
    });
    function updateAutocomplete() {
      const q3 = input.value.trim().toLowerCase();
      if (!q3) {
        ac?.classList.remove("open");
        filtered = [];
        return;
      }
      filtered = POPULAR_IMAGES.filter((img) => img.toLowerCase().includes(q3)).slice(0, 12);
      if (filtered.length === 0 || filtered.length === 1 && filtered[0] === q3) {
        ac?.classList.remove("open");
        return;
      }
      selectedIdx = -1;
      renderAC();
      ac?.classList.add("open");
    }
    function renderAC() {
      if (!ac) return;
      const q3 = input.value.trim().toLowerCase();
      ac.innerHTML = filtered.map((img, i8) => {
        const idx = img.toLowerCase().indexOf(q3);
        let html;
        if (idx >= 0) {
          html = escHtml(img.slice(0, idx)) + '<span class="match">' + escHtml(img.slice(idx, idx + q3.length)) + "</span>" + escHtml(img.slice(idx + q3.length));
        } else {
          html = escHtml(img);
        }
        return `<div class="import-ac-item${i8 === selectedIdx ? " selected" : ""}" data-idx="${i8}">${html}</div>`;
      }).join("");
    }
    function escHtml(s) {
      return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    ac?.addEventListener("mousedown", (e) => {
      const item = e.target.closest(".import-ac-item");
      if (item) {
        input.value = filtered[+item.dataset.idx];
        ac.classList.remove("open");
        input.focus();
      }
    });
    input?.addEventListener("keydown", (e) => {
      if (!ac?.classList.contains("open")) {
        if (e.key === "Enter") {
          doImport();
          e.preventDefault();
        }
        if (e.key === "Tab" && input.value === "") {
          e.preventDefault();
          input.value = "ubuntu:latest";
          chip?.classList.add("hidden");
          updateAutocomplete();
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, filtered.length - 1);
        renderAC();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, -1);
        renderAC();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIdx >= 0) input.value = filtered[selectedIdx];
        ac.classList.remove("open");
        if (input.value.trim()) doImport();
      } else if (e.key === "Escape") {
        ac.classList.remove("open");
      } else if (e.key === "Tab") {
        e.preventDefault();
        if (selectedIdx >= 0) input.value = filtered[selectedIdx];
        else if (filtered.length > 0) input.value = filtered[0];
        ac.classList.remove("open");
      }
    });
    const importForm = document.getElementById("import-form");
    importForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      doImport();
    });
    async function doImport() {
      let image = input.value.trim();
      if (!image) {
        image = "ubuntu:latest";
        input.value = image;
      }
      if (!image.includes(":")) image += ":latest";
      if (goBtn) goBtn.disabled = true;
      input.disabled = true;
      ac?.classList.remove("open");
      if (statusDiv) statusDiv.textContent = `Pulling ${image}...`;
      importCanvas?.classList.add("visible");
      importProgress = -1;
      if (!importAnimId) importAnimId = requestAnimationFrame(drawImportProgress);
      try {
        const proxyHost = location.hostname === "localhost" || location.hostname === "127.0.0.1" ? `https://${location.hostname}:4434` : "https://78.141.219.102.nip.io";
        const pullUrl = `${proxyHost}/pull?image=${encodeURIComponent(image)}`;
        const resp = await fetch(pullUrl);
        if (!resp.ok) {
          const errText = await resp.text();
          throw new Error(errText || `HTTP ${resp.status}`);
        }
        const total = parseInt(resp.headers.get("Content-Length") || "0", 10);
        const reader = resp.body?.getReader();
        const chunks = [];
        let loaded = 0;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            importProgress = total ? loaded / total : -1;
            if (statusDiv) statusDiv.textContent = `Pulling ${image}... ${(loaded / 1024 / 1024).toFixed(1)} MB` + (total ? ` / ${(total / 1024 / 1024).toFixed(1)} MB` : "");
          }
        }
        importProgress = 1;
        if (statusDiv) statusDiv.textContent = `Booting ${image}...`;
        const rootfs = new Uint8Array(loaded);
        let off = 0;
        for (const c of chunks) {
          rootfs.set(c, off);
          off += c.length;
        }
        importCanvas?.classList.remove("visible");
        if (importAnimId) {
          cancelAnimationFrame(importAnimId);
          importAnimId = null;
        }
        if (typeof bootImportedImage === "function") bootImportedImage(image, rootfs.buffer);
      } catch (e) {
        if (statusDiv) statusDiv.textContent = `Error: ${e.message}`;
        importCanvas?.classList.remove("visible");
        if (importAnimId) {
          cancelAnimationFrame(importAnimId);
          importAnimId = null;
        }
        if (goBtn) goBtn.disabled = false;
        input.disabled = false;
      }
    }
  }
})();
/*! Bundled license information:

@xterm/addon-fit/lib/addon-fit.mjs:
@xterm/addon-web-links/lib/addon-web-links.mjs:
@xterm/addon-unicode11/lib/addon-unicode11.mjs:
@xterm/addon-search/lib/addon-search.mjs:
@xterm/addon-image/lib/addon-image.mjs:
@xterm/addon-webgl/lib/addon-webgl.mjs:
  (**
   * Copyright (c) 2014-2024 The xterm.js authors. All rights reserved.
   * @license MIT
   *
   * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
   * @license MIT
   *
   * Originally forked from (with the author's permission):
   *   Fabrice Bellard's javascript vt100 for jslinux:
   *   http://bellard.org/jslinux/
   *   Copyright (c) 2011 Fabrice Bellard
   *)
*/
