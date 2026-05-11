export default Behavior({
  behaviors: [],
  properties: {
    time: {
      type: Number,
      optionalTypes: [String],
      value: (new Date()).getTime() + 864e5,
      observer: function (value, oldValue) {
        if (value && !oldValue) {
          this.getLatestTime();
        }
      }
    },
    status: {
      type: Boolean,
      value: true,
      observer: function (value) {
        if (value) {
          this.init();
        } else {
          clearInterval(this.data.timer);
        }
      }
    },
    timeType: {
      type: String,
      value: "datetime"
    },
    format: {
      type: String,
      value: "{%d}天{%h}时{%m}分{%s}秒"
    },
    isZeroPadd: {
      type: Boolean,
      value: true
    },
    countdownType: {
      type: String,
      value: "normal"
    },
    isClearInterval: {
      type: Boolean,
      value: true
    }
  },
  data: {
    initAddTime: 0,
    timer: null,
    date: []
  },
  ready: function () {
    this.getLatestTime();
  },
  detached: function () {
    if (this.data.isClearInterval) {
      clearInterval(this.data.timer);
    }
  },
  pageLifetimes: {
    hide: function () {
      if (this.data.isClearInterval) {
        clearInterval(this.data.timer);
      }
    },
    show: function () {
      if (this.data.isClearInterval) {
        this.getLatestTime();
      }
    }
  },
  methods: {
    zeroPadding: function (value) {
      value = value.toString();
      return value[1] ? value : "0" + value;
    },
    init: function () {
      clearInterval(this.data.timer);
      const timer = setTimeout(() => {
        this.getLatestTime.call(this);
      }, 1e3);
      this.setData({
        timer: timer
      });
    },
    getLatestTime: function () {
      let {
        time,
        status,
        timeType,
        initAddTime,
        countdownType
      } = this.data;
      let remain = time;

      if (countdownType === "normal") {
        if (timeType !== "second") {
          remain = typeof time === "string" ? time.replace(/-/g, "/") : remain;
          remain = Math.ceil((new Date(remain).getTime() - (new Date()).getTime()) / 1e3);
        }
        if (remain < 0 && timeType !== "second") {
          this._getTimeValue(0);
          this.CountdownEnd();
          return;
        }

        if (remain - initAddTime > 0) {
          this.getLatestForCountDown(remain);
        } else if (remain - initAddTime < 0) {
          this.getLatestForAddTime(remain);
        } else if (remain - initAddTime === 0) {
          if (initAddTime <= 0) {
            this._getTimeValue(remain);
          }
          this.CountdownEnd();
        }

        if (status && remain - initAddTime !== 0) {
          this.init.call(this);
        }
      } else if (countdownType === "anniversary") {
        if (timeType === "second") {
          console.error("countdownType为" + countdownType + "类型时，不可设置timeType值为second");
        } else {
          remain = typeof time === "string" ? time.replace(/-/g, "/") : remain;
          remain = Math.ceil(((new Date()).getTime() - new Date(remain).getTime()) / 1e3);
          if (remain >= 0) {
            this.getLatestForCountDown(remain);
            this.init.call(this);
          } else {
            console.error("time传值错误");
          }
        }
      } else {
        console.error("错误的countdownType类型");
      }
    },
    getLatestForAddTime: function (time) {
      let {
        initAddTime
      } = this.data;
      if (initAddTime !== Math.abs(time)) {
        initAddTime++;
        this._getTimeValue(initAddTime);
        this.setData({
          initAddTime: initAddTime
        });
      }
    },
    getLatestForCountDown: function (time) {
      this._getTimeValue(time);
      this.setData({
        time: this.data.timeType === "second" ? --time : this.data.time
      });
    },
    _getTimeValue: function (time) {
      const {
        format
      } = this.data;
      const date = [];
      const formatParts = format.split(/(\{.*?\})/);
      let remain = time;

      [{
        key: "{%d}",
        type: "day",
        count: 86400
      }, {
        key: "{%h}",
        type: "hour",
        count: 3600
      }, {
        key: "{%m}",
        type: "minute",
        count: 60
      }, {
        key: "{%s}",
        type: "second",
        count: 1
      }].forEach((item) => {
        const index = this._findTimeName(formatParts, item.key);
        if (index === -1) {
          return;
        }
        const name = formatParts[index];
        const value = parseInt(remain / item.count);
        const current = {
          type: item.type,
          name: name,
          value: this.data.isZeroPadd ? this.zeroPadding(value) : value
        };
        remain %= item.count;
        date.push(current);
      });

      this.setData({
        date: date
      });
      return date;
    },
    _findTimeName: function (formatParts, key) {
      const index = formatParts.indexOf(key);
      return index === -1 ? -1 : index + 1;
    },
    CountdownEnd: function () {
      this.triggerEvent("linend", {});
    }
  }
});
