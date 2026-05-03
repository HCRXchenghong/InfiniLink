const api = require('../config/api');
const util = require('../utils/util');
const Poster = require('../components/poster/poster/poster');

const app = getApp();

/**
 * 查询用户是否有未读信息
 */
const getSysMessageCount = function () {
  return new Promise(function (resolve, reject) {
    util.request(api.getSysMessageCountUrl).then(function (res) {
      resolve(res.data);
    })
  })
}
// 选择图片去剪裁
const imageClipper = function (type) {
  let that = this;
  wx.chooseImage({
    count: 1,
    sourceType: ['album', 'camera'],
    success(res) {
      const tempFilePaths = res.tempFilePaths;
      that.setData({
        pic: tempFilePaths[0],
        [type]: true
      })
    },
  })
}
// 上传图片（剪裁后的）
const uploadPicturesPic = function (url, name, type) {
  let that = this;
  wx.showLoading();
  util.uploadFile(api.uploadsUrl, url).then(function (res) {
    var list = {
      [name]: res.data,
      [type]: false,
      imagesubjectClipper: false,
    }
    that.setData(list);
    wx.hideLoading();
  })
}
// 上传文件
const uploadPictures = function (type, name) {
  let that = this;
  if (type === 1) {
    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success(res) {
        wx.showLoading();
        const tempFilePaths = res.tempFilePaths;
        util.uploadFile(api.uploadsUrl, tempFilePaths[0]).then(function (res) {
          var list = {
            [name]: res.data
          }
          that.setData(list)
          wx.hideLoading();
        })
      },
      fail(err) {
        console.log("err", err)
      }
    })
  } else if (type === 2) {
    wx.chooseImage({
      count: name,
      sourceType: ['album', 'camera'],
      success(res) {
        wx.showLoading();
        const tempFilePaths = res.tempFilePaths;
        for (let i in tempFilePaths) {
          util.uploadFile(api.uploadsUrl, tempFilePaths[i]).then(function (res) {
            var image_urls = that.data.image_urls;
            var images = {};
            images.url = res.data;
            image_urls.push(images);
            that.setData({
              image_urls: image_urls,
              mediaType: 0,
            })
            wx.hideLoading();
          })
        }
      },
      fail(err) {
        console.log("err", err)
      }
    })
  } else if (type === 3) {
    wx.chooseMedia({
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      maxDuration: 60,
      camera: 'back',
      success(res) {
        wx.showLoading();
        let tempFiles = res.tempFiles[0];
        that.setData({
          video_height: tempFiles.height,
          video_width: tempFiles.width,
        })
        let thumbTempFilePath = tempFiles.thumbTempFilePath;
        util.uploadFile(api.uploadsUrl, tempFiles.tempFilePath).then(function (res) {
          var list = {
            [name]: res.data,
            mediaType: 1,
          }
          that.setData(list)
          util.uploadFile(api.uploadsUrl, thumbTempFilePath).then(function (data) {
            that.setData({
              video_thumb_url: data.data
            })
            wx.hideLoading();
          })
        })
      },
      fail(err) {
        console.log("err", err)
      }
    })
  }
}
//获取地址
const checkPermission = function (t, e, n) {
  wx.getSetting({
    success: function (a) {
      null == a.authSetting[t] ? wx.authorize({
        scope: t,
        success: function () {
          n();
        },
        fail: function () {}
      }) : a.authSetting[t] ? n() : (wx.showModal({
        title: "提示",
        content: e,
        success: function (t) {
          t.confirm ? (wx.openSetting({})) : t.cancel;
        }
      }));
    }
  });
}
// 获取首页轮播图数据
const getindexBannerList = function () {
  let that = this;
  util.request(api.indexBannerUrl).then(function (res) {
    let args = {};
    args.banner = res.data;
    args.swiperload = false;
    that.setData(args)
  })
}
// 推荐帖子接口
const indexPosts = function () {
  let that = this;
  util.request(api.indexPostsUrl, {
    page: that.data.page,
    type: that.data.type,
    plate_id: that.data.plateId
  }).then(function (res) {
    let data = res.data;
    let args = {};
    if (data.data.length == 0) {
      args.isLastPage = true;
    } else {
      args.posts = that.data.posts.concat(data.data);
      args.page = data.current_page;
      args.loadmoreShow = false;
      args.isLastPage = false;
    }
    args.topicload = false;
    that.setData(args)
  })
}
// 热门标签帖子接口
const indexChoiceness = function () {
  let that = this;
  util.request(api.indexChoicenessUrl).then(function (res) {
    let args = {};
    args.sticky = res.data;
    args.stickyload = false;
    that.setData(args)
  })
}
// 热门标签接口
const tagsHot = function () {
  let that = this;
  util.request(api.tagsHotUrl).then(function (res) {
    let args = {};
    args.categoryMap = that.data.categoryMap.concat(res.data);
    that.setData(args)
  })
}
//跳转帖子详情页
const toPostsDetail = function (e) {
  wx.navigateTo({
    url: '/pages/sticky/sticky?id=' + e.currentTarget.dataset.id,
  })
}
// 帖子详情接口
const postsDetail = function (id) {
  let that = this;
  util.request(api.postsDetailUrl, {
    posts_id: id
  }).then(function (res) {
    if (res.status) {
      let args = {};
      args.posts = res.data;
      args.topicload = false;
      that.setData(args);
    }
  })
}
// 关注接口
const actionFollow = function (userId) {
  return new Promise(function (resolve, reject) {
    util.request(api.userFollowUrl, {
      posts_user_id: userId
    }, "POST").then(function (res) {
      if (res.status) {
        resolve(res);
      } else {
        reject(res);
      }
    })
  })
}
// 用户界面关注接口
const userInfoActionFollow = function (e) {
  let that = this;
  let userId = e.currentTarget.dataset.userid;
  actionFollow(userId).then((res) => {
    if (res.status) {
      let args = {};
      let userInfo = that.data.userInfo;
      userInfo.isFollow = !userInfo.isFollow;
      args.userInfo = userInfo;
      that.setData(args);
      wx.showToast({
        title: res.message,
        icon: 'none',
        duration: 1500
      })
    }
  })
}

// 用户关注接口
const userActionFollow = function (e) {
  let that = this;
  let userId = e.currentTarget.dataset.userid;
  let index = e.currentTarget.dataset.index;
  actionFollow(userId).then((res) => {
    if (res.status) {
      let args = {};
      let userList = that.data.userList;
      userList[index].is_together_follow = !userList[index].is_together_follow;
      args.userList = userList;
      that.setData(args);
      wx.showToast({
        title: res.message,
        icon: 'none',
        duration: 1500
      })
    }
  })
}
// 搜索接口
const indexSearch = function () {
  let that = this;
  let type = that.data.currentData;
  util.request(api.indexSearchUrl, {
    keyword: that.data.keyword,
    type: type,
    page: that.data.page
  }).then(function (res) {
    let data = res.data;
    let args = {};
    if (data.data.length <= 0 && that.data.page == 1) {
      args.isNull = true;
    }
    if (data.data.length == 0) {
      args.isLastPage = true;
    } else if (type == 0) {
      args.posts = that.data.posts.concat(data.data);
      args.postsPage = data.current_page;
    } else if (type == 1) {
      args.cats = that.data.cats.concat(data.data);
      args.catsPage = data.current_page;
    } else if (type == 2) {
      args.userList = that.data.userList.concat(data.data);
      args.userPage = data.current_page;
    }
    args.topicload = false;
    args.searchViewVisible = false;
    that.setData(args);
  })
}
// 搜索数量接口
const searchCount = function () {
  let that = this;
  util.request(api.searchCountUrl, {
    keyword: that.data.keyword
  }).then(function (res) {
    let tabs = that.data.tabs;
    tabs[0].cont = res.data.posts_count, tabs[1].cont = res.data.circle_count, tabs[2].cont = res.data.user_count;
    let args = {};
    args.tabs = tabs;
    that.setData(args);
  })
}
// 热门搜索接口
const searchHotList = function () {
  let that = this;
  util.request(api.searchHotListUrl).then(function (res) {
    let args = {};
    args.hots = res.data;
    that.setData(args);
  })
}
// 首页轮播搜索接口
const searchCarouselList = function () {
  let that = this;
  util.request(api.searchCarouselListUrl).then(function (res) {
    let args = {};
    args.searchText = res.data;
    that.setData(args);
  })
}

// 标签获取帖子列表（瀑布流）
const postsTage = function () {
  let that = this;
  util.request(api.postsTageUrl, {
    tag_id: that.data.tagid,
    page: that.data.page
  }).then(function (res) {
    let data = res.data;
    let args = {};
    if (data.data.length > 0) {
      args.posts = data.data;
    } else if (data.data == "") {
      args.loadingShow = true;
    }
    args.page = data.current_page;
    args.topicload = false;
    that.setData(args);
    if (data.data.length > 0 || that.data.empty) {
      wx.lin.renderWaterFlow(that.data.posts, that.data.empty);
    }
  })
}
// 用户板块列表
const userPlate = function () {
  let that = this;
  util.request(api.userPlateUrl).then(function (res) {
    let args = {};
    args.header = that.data.header.concat(res.data);
    that.setData(args);
  })
}

// 用户添加板块
const userPlateAdd = function (e) {
  let that = this;
  let plate_id = e.currentTarget.dataset.id;
  let plate_name = e.currentTarget.dataset.name;
  util.request(api.userPlateAddUrl, {
    plate_id: plate_id
  }, 'POST').then(function (res) {
    if (res.status) {
      if (res.code == 421001) {
        wx.showToast({
          title: res.message,
          icon: 'none',
          duration: 1500
        })
      } else {
        let args = {};
        let header = {};
        header.plate_id = plate_id;
        header.plate_name = plate_name;
        args.header = that.data.header.concat(header);
        that.setData(args);
      }
    } else {
      wx.showToast({
        title: '遇到了一个未知错误，请联系睡醒官方客服反馈！',
        icon: 'none',
        duration: 1500
      })
    }
  })
}

// 用户删除板块
const userPlateDelete = function (e) {
  let that = this;
  let id = e.currentTarget.dataset.id;
  let index = e.currentTarget.dataset.index;
  util.request(api.userPlateDeleteUrl, {
    id: id
  }, 'POST').then(function (res) {
    if (res.status) {
      let args = {};
      let header = that.data.header;
      header.splice([index], 1);
      args.header = header;
      that.setData(args);
    } else {
      wx.showToast({
        title: '遇到了一个未知错误，请联系睡醒官方客服反馈！',
        icon: 'none',
        duration: 1500
      })
    }
  })
}
//跳转用户详情页
const userTap = function (e) {
  let userId = e.currentTarget.dataset.uid;
  wx.navigateTo({
    url: '/pages/user/user?id=' + userId,
  })
}
//标签获取帖子列表
const tagePostsList = function () {
  let that = this;
  util.request(api.postsTageV2Url, {
    tag_id: that.data.id,
    page: that.data.page
  }).then(function (res) {
    let args = {};
    if (res.data.data.length == 0) {
      args.isLastPage = true;
    }
    args.posts = that.data.posts.concat(res.data.data);
    args.topicload = false;
    args.page = res.data.current_page;
    that.setData(args);
  })
}

// 文章组件事件
//帖子点击关注用户
const postsActionFollow = function (e) {
  let that = this;
  let userId = e.currentTarget.dataset.userid;
  actionFollow(userId).then((res) => {
    if (res.status) {
      let args = {};
      let posts = that.data.posts;
      for (var v in posts) {
        if (posts[v].user.id == userId) {
          posts[v].is_follow_user = !posts[v].is_follow_user;
        }
      }
      args.posts = posts;
      that.setData(args);
      wx.showToast({
        title: res.message,
        icon: 'none',
        duration: 1500
      })
    }
  })
}
// 帖子喜欢接口
const taplikes = function (e) {
  let that = this;
  var id = e.currentTarget.dataset.id;
  let postsIndex = e.currentTarget.dataset.index;
  util.request(api.postsLikeUrl, {
    posts_id: id
  }, "POST").then(function (res) {
    if (res.status) {
      let args = {};
      let posts = that.data.posts;
      if (posts[postsIndex].is_like) {
        posts[postsIndex].like_count -= 1;
      } else {
        posts[postsIndex].like_count += 1;
      }
      posts[postsIndex].is_like = !posts[postsIndex].is_like;
      args.posts = posts;
      that.setData(args);
    }
  })
}
// 帖子收藏接口
const editOrCollectTap = function () {
  let that = this;
  util.request(api.postsCollectUrl, {
    posts_id: that.data.postsId
  }, "POST").then(function (res) {
    if (res.status) {
      let args = {};
      let postsIndex = that.data.postsIndex;
      let posts = that.data.posts;
      posts[postsIndex].is_collect = !posts[postsIndex].is_collect;
      args.posts = posts;
      args.showDialog = !that.data.showDialog;
      that.setData(args);
      if (that.data.isCollect) {
        wx.showToast({
          title: '取消收藏成功',
          icon: 'none',
          duration: 1500
        })
      } else {
        wx.showToast({
          title: '收藏成功',
          icon: 'none',
          duration: 1500
        })
      }
    }
  })
}
// 删除帖子接口
const bouncedDeleteTap = function () {
  let that = this;
  util.request(api.postsDeleteUrl, {
    posts_id: that.data.postsId
  }, "POST").then(function (res) {
    if (res.status) {
      let args = {};
      let posts = that.data.posts;
      posts.splice([that.data.postsIndex], 1);
      args.posts = posts;
      args.bounced = !that.data.bounced;
      that.setData(args)
    }
  })
}
//喜欢评论
const tapCommentlike = function (e) {
  let that = this;
  let cmtindex = e.currentTarget.dataset.cmtindex;
  util.request(api.commentLikeAddUrl, {
    comment_id: e.currentTarget.dataset.id
  }, 'POST').then(function (res) {
    if (res.status) {
      let args = {};
      let comments = that.data.comments;
      if (comments[cmtindex].is_like) {
        comments[cmtindex].like_count -= 1;
      } else {
        comments[cmtindex].like_count += 1;
      }
      comments[cmtindex].is_like = !comments[cmtindex].is_like;
      args.comments = comments;
      that.setData(args);
    }
  })
}
//喜欢评论的评论
const tapCommentslike = function (e) {
  let that = this;
  let cmtindex = e.currentTarget.dataset.cmtindex;
  let cmtindexs = e.currentTarget.dataset.cmtindexs;
  util.request(api.commentLikeAddUrl, {
    comment_id: e.currentTarget.dataset.id
  }, 'POST').then(function (res) {
    if (res.status) {
      let args = {};
      let comments = that.data.comments;
      if (comments[cmtindex].child[cmtindexs].is_like) {
        comments[cmtindex].child[cmtindexs].like_count -= 1;
      } else {
        comments[cmtindex].child[cmtindexs].like_count += 1;
      }
      comments[cmtindex].child[cmtindexs].is_like = !comments[cmtindex].child[cmtindexs].is_like;
      args.comments = comments;
      that.setData(args);
    }
  })
}
//删除评论
const tapDeleteComment = function (e) {
  let that = this;
  wx.showModal({
    title: '提示',
    content: '确定要删除您的这条评论吗？',
    success(res) {
      if (res.confirm) {
        let cmtindex = e.currentTarget.dataset.cmtindex;
        util.request(api.commentDeleteAddUrl, {
          id: e.currentTarget.dataset.id
        }, 'POST').then(function (sec) {
          if (sec.status) {
            let args = {};
            let comments = that.data.comments;
            comments.splice([cmtindex], 1);
            args.comments = comments;
            that.setData(args);
          }
        })
      } else if (res.cancel) {}
    }
  })
}
//删除评论的评论
const tapDeleteComments = function (e) {
  let that = this;
  wx.showModal({
    title: '提示',
    content: '确定要删除您的这条评论吗？',
    success(res) {
      if (res.confirm) {
        let cmtindex = e.currentTarget.dataset.cmtindex;
        let cmtindexs = e.currentTarget.dataset.cmtindexs;
        util.request(api.commentDeleteAddUrl, {
          id: e.currentTarget.dataset.id
        }, 'POST').then(function (sec) {
          if (sec.status) {
            let args = {};
            let comments = that.data.comments;
            comments[cmtindex].child.splice([cmtindexs], 1);
            args.comments = comments;
            that.setData(args);
          }
        })
      } else if (res.cancel) {}
    }
  })
}
//刷新/加载更多评论
const loadRefreshComments = function (type) {
  let that = this;
  if (type == 0) {
    that.setData({
      comments: [],
      cPage: 1
    })
  }
  let postsId = that.data.postsId;
  let cPage = that.data.cPage;
  util.request(api.commentByPostsIdUrl, {
    posts_id: postsId,
    page: cPage,
  }).then(function (res) {
    let data = res.data;
    if (data.data.length < 10) {
      that.setData({
        isCommentPage: true
      })
    }
    if (data.data.length > 0) {
      that.setData({
        comments: that.data.comments.concat(data.data),
        cPage: data.current_page
      })
    }
  })
}
//评论上拉加载
const commentTolower = function () {
  let that = this;
  that.setData({
    cPage: that.data.cPage + 1,
    isCommentShow: true,
    isCommentPage: false,
  })
  that.loadRefreshComments(1);
}
//预览图片
const previewImgFunc = function (e) {
  var src = e.currentTarget.dataset.src;
  var imageslist = e.currentTarget.dataset.list;
  var imagesArr = [];
  for (let i in imageslist) {
    imagesArr.push(imageslist[i].img_url)
  }
  wx.previewImage({
    current: src,
    urls: imagesArr,
  })
}
// 操作帖子方法
const editTap = function (e) {
  let that = this;
  that.setData({
    postsIndex: e.currentTarget.dataset.index,
    showDialog: !that.data.showDialog,
    postsId: e.currentTarget.dataset.id,
    isMyPosts: e.currentTarget.dataset.ismyposts,
    isCollect: e.currentTarget.dataset.iscollect,
  })
}
// 分享帖子方法
const shareTap = function (e) {
  let that = this;
  that.setData({
    postsIndex: e.currentTarget.dataset.index,
    showShare: !that.data.showShare,
    postsId: e.currentTarget.dataset.id,
  })
}
//使用微信内置地图查看位置
const openmap = function (e) {
  var lng = parseFloat(e.currentTarget.dataset.lng);
  var lat = parseFloat(e.currentTarget.dataset.lat);
  var name = e.currentTarget.dataset.name;
  wx.openLocation({
    latitude: lat,
    longitude: lng,
    scale: 8,
    name: name
  })
}
// 展开更多
const unfoldTap = function (e) {
  let that = this;
  let id = e.currentTarget.dataset.id;
  let posts = that.data.posts;
  for (var item in posts) {
    if (posts[item].id == id) {
      posts[item].is_content_beyond = false;
      break;
    }
  }
  that.setData({
    posts: posts
  })
}
// 打开视频
const getVideoUrl = function (e) {
  let that = this;
  that.setData({
    indexvideo: e.currentTarget.dataset.index,
    video: e.currentTarget.dataset.video,
    popupshow: true,
  })
}
// 关闭视频
const popuphidden = function () {
  this.setData({
    video: '',
    popupshow: false,
  })
}
//跳转圈子
const routeClubDetail = function (e) {
  let id = e.currentTarget.dataset.id;
  wx.navigateTo({
    url: '/pages/circle/list?id=' + id,
  })
}
//跳转标签
const toTagesInfo = function (e) {
  let id = e.currentTarget.dataset.id;
  let name = e.currentTarget.dataset.name;
  wx.navigateTo({
    url: '/pages/tags/tags?id=' + id + '&name=' + name,
  })
}
//取消
const onClickCancle = function () {
  this.setData({
    showDialog: !this.data.showDialog
  })
}
//取消分享
const onClickShare = function () {
  this.setData({
    showShare: !this.data.showShare
  })
}
//显示删除菜单
const editOrDeleteTap = function () {
  this.setData({
    showDialog: !this.data.showDialog,
    bounced: !this.data.bounced
  })
}
//取消删除
const bouncedTap = function () {
  this.setData({
    bounced: !this.data.bounced
  })
}
//打开评论菜单
const gotoComments = function (e) {
  let that = this;
  let postsId = e.currentTarget.dataset.id;
  let commentCount = e.currentTarget.dataset.comment_count;
  that.setData({
    showComments: !that.data.showComments,
    commentCount: commentCount,
    postsId: postsId,
    commentIsNull: false,
  })
  util.request(api.commentByPostsIdUrl, {
    posts_id: postsId,
    page: 1,
  }).then(function (res) {
    that.setData({
      commentIsNull: true,
      comments: res.data.data,
      cPage: res.data.current_page,
    })
  })
}

//关闭评论菜单
const toShutComments = function () {
  this.setData({
    showComments: !this.data.showComments
  })
}
// 打开评论输入框
const tapComment = function (e) {
  let postsId = e.currentTarget.dataset.postsid;
  let commentId = e.currentTarget.dataset.id;
  let replyUserId = e.currentTarget.dataset.userid;
  let replyName = e.currentTarget.dataset.reply;
  if (typeof (replyName) != "undefined" && commentId != "undefined" && replyUserId != "undefined") {
    replyName = "回复 " + replyName + "：";
  } else {
    replyName = "说点什么";
    commentId = "";
    replyUserId = "";
  }
  if (typeof (postsId) != "undefined") {
    this.setData({
      postsId: postsId,
    })
  }
  this.setData({
    showTextarea: !this.data.showTextarea,
    focus: true,
    commentId: commentId,
    replyUserId: replyUserId,
    replyName: replyName,
  })
}
// 关闭评论输入框
const shutCommentShow = function () {
  this.setData({
    showTextarea: !this.data.showTextarea,
    focus: false,
    commentId: "",
    replyUserId: "",
    replyName: "说点什么",
  })
}
//评论Input监听/发送评论
const onInputComment = function (e) {
  wx.showLoading({
    title: ' ',
  })
  let that = this;
  var value = e.detail.value;
  let imageValue = that.data.imageValue;
  let postsId = that.data.postsId;
  let commentId = that.data.commentId;
  let replyUserId = that.data.replyUserId;
  util.request(api.commentAddUrl, {
    posts_id: postsId,
    comment_content: value,
    comment_img_url: imageValue,
    comment_id: commentId,
    reply_user_id: replyUserId,
  }, "POST").then(function (res) {
    if (res.status) {
      wx.hideLoading();
      that.setData({
        showTextarea: !that.data.showTextarea,
        focus: false,
      })
      wx.showToast({
        title: '评论成功！审核中...',
        icon: 'none',
        duration: 1500
      })
      that.loadRefreshComments(0);
    } else {
      wx.showToast({
        title: '评论失败了！',
        icon: 'none',
        duration: 1500
      })
      wx.hideLoading();
    }
  })
}
//添加评论图片
const addCommentPic = function (e) {
  this.uploadPictures(1, e.currentTarget.dataset.name);
  this.setData({
    showTextarea: !this.data.showTextarea,
    focus: false,
  })
}
//删除评论图片
const delCommentPic = function () {
  this.setData({
    imageValue: ''
  })
}
/**
 * 海报分享
 */
const sharePosterClick = function () {
  let that = this;
  util.request(api.postsMakeShowQcodeUrl, {
    posts_id: that.data.postsId,
  }).then(function (res) {
    if (res.status) {
      let posterConfig = {};
      if (res.data.img != '' && res.data.img != null) {
        posterConfig = {
          width: 750,
          height: 1334,
          backgroundColor: '#f5f5f5',
          debug: false,
          pixelRatio: 1,
          blocks: [{
            width: 690,
            height: 1084,
            x: 30,
            y: 150,
            backgroundColor: '#FFFFFF',
            borderRadius: 30,
          }, ],
          texts: [{
              x: 370,
              y: 94,
              baseLine: 'middle',
              textAlign: 'center',
              text: "睡醒，专属互联网人的内容兴趣社区",
              fontSize: 32,
              color: '#000',
            }, {
              x: 70,
              y: 800,
              fontSize: 28,
              lineHeight: 40,
              baseLine: 'middle',
              text: res.data.content,
              width: 600,
              lineNum: 3,
              color: '#333333',
              zIndex: 200,
            },
            {
              x: 370,
              y: 1190,
              baseLine: 'middle',
              textAlign: 'center',
              text: "微信扫一扫或长按识别小程序查看详情",
              fontSize: 24,
              color: '#949494',
              zIndex: 200,
            }, {
              x: 124,
              y: 726,
              baseLine: 'middle',
              text: res.data.user.user_name,
              fontSize: 32,
              color: '#000',
              zIndex: 200,
            }
          ],
          images: [{
              width: 690,
              height: 520,
              x: 30,
              y: 150,
              url: res.data.img,
              zIndex: 100,
              borderRadius: 30,
            },
            {
              width: 200,
              height: 200,
              x: 275,
              y: 950,
              url: res.data.qrcode,
            }, {
              width: 50,
              height: 50,
              x: 60,
              y: 700,
              borderRadius: 50,
              url: res.data.user.user_avatar,
            }
          ]
        }
      } else {
        posterConfig = {
          width: 750,
          height: 1334,
          backgroundColor: '#f5f5f5',
          debug: false,
          pixelRatio: 1,
          blocks: [{
            width: 690,
            height: 1084,
            x: 30,
            y: 150,
            backgroundColor: '#FFFFFF',
            borderRadius: 30,
          }, ],
          texts: [{
              x: 370,
              y: 94,
              baseLine: 'middle',
              textAlign: 'center',
              text: "睡醒，专属互联网人的内容兴趣社区",
              fontSize: 32,
              color: '#000',
            }, {
              x: 70,
              y: 350,
              fontSize: 28,
              lineHeight: 40,
              baseLine: 'middle',
              text: res.data.content,
              width: 600,
              lineNum: 5,
              color: '#333333',
              zIndex: 200,
            },
            {
              x: 370,
              y: 1070,
              baseLine: 'middle',
              textAlign: 'center',
              text: "微信扫一扫或长按识别小程序查看详情",
              fontSize: 24,
              color: '#949494',
              zIndex: 200,
            }, {
              x: 124,
              y: 276,
              baseLine: 'middle',
              text: res.data.user.user_name,
              fontSize: 32,
              color: '#000',
              zIndex: 200,
            }
          ],
          images: [{
            width: 300,
            height: 300,
            x: 225,
            y: 700,
            url: res.data.qrcode,
            zIndex: 100,
          }, {
            width: 50,
            height: 50,
            x: 60,
            y: 250,
            borderRadius: 50,
            url: res.data.user.user_avatar,
          }]
        }
      }
      that.setData({
        posterConfig: posterConfig
      }, () => {
        Poster.create(true); // 入参：true为抹掉重新生成 
      });
    } else {
      wx.showToast({
        title: '生成海报失败了，请联系睡醒官方客服反馈！',
        icon: 'none',
        duration: 1500
      })
    }
  })
}
//画报生成成功
const onPosterSuccess = function (e) {
  this.needRefresh = false;
  const {
    detail
  } = e;
  wx.previewImage({
    current: detail,
    urls: [detail]
  })
}
//画报生成失败
const onPosterFail = function (err) {
  console.error(err);
}
//打赏列表弹窗
const onClickReward = function (e) {
  let that = this;
  let postsId = e.currentTarget.dataset.id;
  let exceptionalCount = e.currentTarget.dataset.ecount;
  if (typeof (postsId) != "undefined" && exceptionalCount != "undefined") {
    util.request(api.getExceptionalListUrl, {
      posts_id: postsId
    }).then(function (res) {
      let args = {};
      args.exceptionalList = res.data;
      args.exceptionalCount = exceptionalCount;
      that.setData(args);
    })
  }
  that.setData({
    rewardDialog: !that.data.rewardDialog,
  })
}
//打赏弹窗
const rewardTap = function (e) {
  let that = this;
  that.setData({
    rewardPopup: !that.data.rewardPopup,
    postsId: e.currentTarget.dataset.id,
    postsUserId: e.currentTarget.dataset.userid,
    postsIndex: e.currentTarget.dataset.index,
    rewardPrice: '',
  })
}
//关闭打赏弹窗
const shutReward = function () {
  let that = this;
  that.setData({
    rewardPopup: !that.data.rewardPopup,
  })
}
//打赏选择金额
const addRewardPrice = function (e) {
  this.setData({
    rewardPrice: e.currentTarget.dataset.price
  })
}
//打赏输入金额
const rewardPriceChange = function (e) {
  this.setData({
    rewardPrice: e.detail.value
  })
}
//用户搜索列表
const mySearchList = function () {
  let that = this;
  util.request(api.mySearchListUrl).then(function (res) {
    if (res.status) {
      let args = {}
      if (res.data.length <= 0) {
        args.myhotsSat = false
      }
      args.myhots = res.data
      that.setData(args)
    }
  })
}
//用户删除搜索记录
const myDelSearch = function (e) {
  let that = this;
  let index = e.currentTarget.dataset.index;
  util.request(api.myDelSearchUrl, {
    id: e.currentTarget.dataset.id
  }).then(function (res) {
    if (res.status) {
      let myhots = that.data.myhots;
      let args = {}
      myhots.splice([index], 1);
      args.myhots = myhots
      that.setData(args)
    }
  })
}
//用户删除全部搜索记录
const myDelAllSearch = function () {
  let that = this;
  util.request(api.myDelAllSearchUrl).then(function (res) {
    if (res.status) {
      wx.showToast({
        title: '操作成功',
        icon: 'none',
        duration: 1500
      })
      that.mySearchList();
    }
  })
}
//全屏预览图片（发帖用）
const onPreviewPicture = function (e) {
  let current = e.currentTarget.dataset.src;
  let piclist = e.currentTarget.dataset.pic;
  var picArr = [];
  for (let i in piclist) {
    picArr.push(piclist[i].url)
  }
  wx.previewImage({
    current: current,
    urls: picArr
  })
}
//全屏预览图片（单张）
const onPreviewImage = function (e) {
  let current = e.currentTarget.dataset.src;
  let picArr = [];
  picArr.push(current)
  wx.previewImage({
    current: current,
    urls: picArr
  })
}

module.exports = function (obj) {

  obj.onPreviewImage = onPreviewImage;
  obj.onPreviewPicture = onPreviewPicture;
  obj.myDelAllSearch = myDelAllSearch;
  obj.myDelSearch = myDelSearch;
  obj.mySearchList = mySearchList;
  obj.imageClipper = imageClipper;
  obj.uploadPicturesPic = uploadPicturesPic;
  obj.shutReward = shutReward;
  obj.rewardPriceChange = rewardPriceChange;
  obj.addRewardPrice = addRewardPrice;
  obj.onClickReward = onClickReward;
  obj.rewardTap = rewardTap;
  obj.searchCarouselList = searchCarouselList;
  obj.getSysMessageCount = getSysMessageCount;
  obj.userTap = userTap;
  obj.userInfoActionFollow = userInfoActionFollow;
  obj.toPostsDetail = toPostsDetail;
  obj.userPlateDelete = userPlateDelete;
  obj.userPlateAdd = userPlateAdd;
  obj.userPlate = userPlate;
  obj.postsTage = postsTage;
  obj.tagePostsList = tagePostsList;
  obj.commentTolower = commentTolower;
  obj.tapDeleteComments = tapDeleteComments;
  obj.tapCommentslike = tapCommentslike;
  obj.uploadPictures = uploadPictures;
  obj.checkPermission = checkPermission;
  obj.getindexBannerList = getindexBannerList;
  obj.indexPosts = indexPosts;
  obj.indexChoiceness = indexChoiceness;
  obj.taplikes = taplikes;
  obj.editOrCollectTap = editOrCollectTap;
  obj.bouncedDeleteTap = bouncedDeleteTap;
  obj.actionFollow = actionFollow;
  obj.postsActionFollow = postsActionFollow;
  obj.userActionFollow = userActionFollow;
  obj.postsDetail = postsDetail;
  obj.indexSearch = indexSearch;
  obj.searchCount = searchCount;
  obj.searchHotList = searchHotList;
  obj.tapCommentlike = tapCommentlike;
  obj.tagsHot = tagsHot;
  obj.tapDeleteComment = tapDeleteComment;
  obj.loadRefreshComments = loadRefreshComments;
  obj.shareTap = shareTap;
  obj.editTap = editTap;
  obj.previewImgFunc = previewImgFunc;
  obj.getVideoUrl = getVideoUrl;
  obj.gotoComments = gotoComments;
  obj.toShutComments = toShutComments;
  obj.openmap = openmap;
  obj.unfoldTap = unfoldTap;
  obj.popuphidden = popuphidden;
  obj.onClickCancle = onClickCancle;
  obj.onClickShare = onClickShare;
  obj.toTagesInfo = toTagesInfo;
  obj.editOrDeleteTap = editOrDeleteTap;
  obj.bouncedTap = bouncedTap;
  obj.tapComment = tapComment;
  obj.shutCommentShow = shutCommentShow;
  obj.onInputComment = onInputComment;
  obj.addCommentPic = addCommentPic;
  obj.delCommentPic = delCommentPic;
  obj.sharePosterClick = sharePosterClick;
  obj.onPosterSuccess = onPosterSuccess;
  obj.onPosterFail = onPosterFail;
  obj.routeClubDetail = routeClubDetail;
}