var e = getApp();

Component({
    data: {
        selected: 0,
        sysMessageCount: 0,
        color: "#949494",
        selectedColor: "#333333",
        fontWeight: "bold",
        list: [{
            pagePath: "/pages/tabbar/index/index",
            iconPath: "/image/tabbar/tab_index_normal.png",
            selectedIconPath: "/image/tabbar/tab_index_active.png",
            text: "首页"
        }, {
            pagePath: "/pages/tabbar/circle/circle",
            iconPath: "/image/tabbar/tab_nearby_normal.png",
            selectedIconPath: "/image/tabbar/tab_nearby_active.png",
            text: "圈子"
        }, {
            pagePath: "/pages/creat/creat",
            iconPath: "/image/tabbar/icon_add.png",
            selectedIconPath: "/image/tabbar/icon_add.png",
            text: "",
            isSpecial: !0
        }, {
            pagePath: "/pages/tabbar/message/message",
            iconPath: "/image/tabbar/tab_message_normal.png",
            selectedIconPath: "/image/tabbar/tab_message_active.png",
            text: "消息"
        }, {
            pagePath: "/pages/tabbar/mine/mine",
            iconPath: "/image/tabbar/tab_user_normal.png",
            selectedIconPath: "/image/tabbar/tab_user_active.png",
            text: "我家"
        }]
    },
    attached: function () {},
    methods: {
        switchTab: function (e) {
            let index = e.currentTarget.dataset.index;
            let url = e.currentTarget.dataset.url;
            if (this.data.list[index].isSpecial) {
                wx.navigateTo({
                    url: url
                });
            } else {
                this.setData({
                    selected: index
                }), wx.switchTab({
                    url: url
                });
            }
        }
    }
});