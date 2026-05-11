var Parser = require("./parser");
var plugins = [];

Component({
  data: {
    nodes: [],
  },
  properties: {
    containerStyle: String,
    content: {
      type: String,
      value: "",
      observer: function (value) {
        this.setContent(value);
      },
    },
    copyLink: {
      type: Boolean,
      value: true,
    },
    domain: String,
    errorImg: String,
    lazyLoad: Boolean,
    loadingImg: String,
    pauseVideo: {
      type: Boolean,
      value: true,
    },
    previewImg: {
      type: Boolean,
      value: true,
    },
    scrollTable: Boolean,
    selectable: null,
    setTitle: {
      type: Boolean,
      value: true,
    },
    showImgMenu: {
      type: Boolean,
      value: true,
    },
    tagStyle: Object,
    useAnchor: null,
  },
  created: function () {
    this.plugins = [];
    this._destroyed = false;
    for (var i = plugins.length; i--;) {
      this.plugins.push(new plugins[i](this));
    }
  },
  detached: function () {
    this._destroyed = true;
    clearInterval(this._timer);
    this._hook("onDetached");
  },
  methods: {
    in: function (page, selector, scrollTopKey) {
      if (page && selector && scrollTopKey) {
        this._in = {
          page: page,
          selector: selector,
          scrollTop: scrollTopKey,
        };
      }
    },
    navigateTo: function (anchorId, offset) {
      var self = this;
      return new Promise(function (resolve, reject) {
        if (!self.data.useAnchor) {
          reject(Error("Anchor is disabled"));
          return;
        }

        var query = wx.createSelectorQuery().in(self._in ? self._in.page : self);
        query.select((self._in ? self._in.selector : "._root") + (anchorId ? ">>>#" + anchorId : "")).boundingClientRect();
        if (self._in) {
          query.select(self._in.selector).scrollOffset().select(self._in.selector).boundingClientRect();
        } else {
          query.selectViewport().scrollOffset();
        }

        query.exec(function (res) {
          if (!res[0]) {
            reject(Error("Label not found"));
            return;
          }

          var targetScrollTop = res[1].scrollTop + res[0].top - (res[2] ? res[2].top : 0) + (offset || parseInt(self.data.useAnchor) || 0);
          if (self._in) {
            var update = {};
            update[self._in.scrollTop] = targetScrollTop;
            self._in.page.setData(update);
          } else {
            wx.pageScrollTo({
              scrollTop: targetScrollTop,
              duration: 300,
            });
          }
          resolve();
        });
      });
    },
    getText: function (nodes) {
      var text = "";

      function walk(list) {
        for (var i = 0; i < list.length; i++) {
          var node = list[i];
          if (node.type === "text") {
            text += node.text.replace(/&amp;/g, "&");
          } else if (node.name === "br") {
            text += "\n";
          } else {
            var isBlock = node.name === "p" || node.name === "div" || node.name === "tr" || node.name === "li" || (node.name[0] === "h" && node.name[1] > "0" && node.name[1] < "7");
            if (isBlock && text && text[text.length - 1] !== "\n") {
              text += "\n";
            }
            if (node.children) {
              walk(node.children);
            }
            if (isBlock) {
              if (text[text.length - 1] !== "\n") {
                text += "\n";
              }
            } else if (node.name === "td" || node.name === "th") {
              text += "\t";
            }
          }
        }
      }

      walk(nodes || this.data.nodes);
      return text;
    },
    getRect: function () {
      var self = this;
      return new Promise(function (resolve, reject) {
        wx.createSelectorQuery().in(self).select("._root").boundingClientRect().exec(function (res) {
          if (res[0]) {
            resolve(res[0]);
          } else {
            reject(Error("Root label not found"));
          }
        });
      });
    },
    setContent: function (content, append) {
      var self = this;
      this._destroyed = false;
      if (!this.imgList || !append) {
        this.imgList = [];
      }
      this._videos = [];

      var update = {};
      var nodes = new Parser(this).parse(content);
      if (append) {
        for (var i = nodes.length; i--;) {
          update["nodes[" + (this.data.nodes.length + i) + "]"] = nodes[i];
        }
      } else {
        update.nodes = nodes;
      }

      this.setData(update, function () {
        self._hook("onLoad");
        self.triggerEvent("load");
      });

      var heightCache;
      clearInterval(this._timer);
      this._timer = setInterval(function () {
        if (self._destroyed) {
          clearInterval(self._timer);
          return;
        }
        self.getRect().then(function (rect) {
          if (rect.height === heightCache) {
            self.triggerEvent("ready", rect);
            clearInterval(self._timer);
          }
          heightCache = rect.height;
        }).catch(function () {});
      }, 350);
    },
    _hook: function (name) {
      for (var i = plugins.length; i--;) {
        if (this.plugins[i][name]) {
          this.plugins[i][name]();
        }
      }
    },
    _add: function (event) {
      event.detail.root = this;
    },
  },
});
