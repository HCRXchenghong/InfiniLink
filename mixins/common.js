const api = require('../config/api');
const util = require('../utils/util');
const Poster = require('../components/poster/poster/poster');
const levelUtils = require('../utils/level');

const app = getApp();
const DEFAULT_PAGE_DATA = {
  posterConfig: {},
  replyName: '说点什么',
  showTextarea: false,
  showComments: false,
  focus: false,
  inputValue: '',
  imageValue: '',
  commentId: '',
  replyUserId: '',
  postsId: 0,
  comments: [],
  commentCount: 0,
  commentIsNull: false,
  cPage: 1,
  isCommentShow: false,
  isCommentPage: false,
  rewardPopup: false,
  rewardDialog: false,
  rewardPrice: '',
  exceptionalList: [],
  exceptionalCount: 0,
  showDialog: false,
  showShare: false,
  popupshow: false,
  indexvideo: -1,
  bounced: false,
  isCollect: false,
  isMyPosts: false,
  subject: {},
  feedAdCard: null,
  carouselAds: [],
  carouselAdIndex: 0,
  detailAdCard: null,
  splashAdCard: null,
  showSplashAd: false,
};

function normalizeText(value, fallback = '') {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(function (item) {
      return normalizeText(item, '');
    }).filter(Boolean).join(' ');
  }
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') {
      return value.text;
    }
    if (typeof value.content === 'string') {
      return value.content;
    }
    if (typeof value.posts_content === 'string') {
      return value.posts_content;
    }
    if (typeof value.search_content === 'string') {
      return value.search_content;
    }
  }
  return fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value, fallback) {
  const base = fallback && typeof fallback === 'object' ? Object.assign({}, fallback) : {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return base;
  }
  return Object.assign(base, value);
}

function normalizeImageItem(value) {
  const image = normalizeObject(value, {
    img_url: '',
    url: ''
  });
  image.img_url = normalizeText(image.img_url || image.url);
  image.url = normalizeText(image.url || image.img_url);
  return image;
}

function normalizeUser(value) {
  const user = normalizeObject(value, {
    id: 0,
    user_name: '',
    user_avatar: '',
    is_official: 0,
    is_authentication: 0,
    is_member: 0,
    membership_tier: '',
    membership_active: 0,
    membership_expires_at: '',
    membership_expire_text: '',
    membership_days_left: 0,
    level_no: 1,
    level_label: 'LV1',
    level_score: 0,
    level_next_no: 1,
    level_next_label: 'LV1',
    level_score_to_next: 0,
    level_progress_percent: 0,
    level_max_reached: 0
  });
  user.user_name = normalizeText(user.user_name);
  user.user_avatar = normalizeText(user.user_avatar);
  user.id = Number(user.id || 0);
  user.is_official = Number(user.is_official || 0);
  user.is_authentication = Number(user.is_authentication || 0);
  user.membership_expires_at = normalizeText(user.membership_expires_at);
  user.membership_expire_text = normalizeText(user.membership_expire_text);
  user.membership_days_left = Number(user.membership_days_left || 0);
  user.is_member = Number(user.is_member || user.membership_active || 0);
  user.membership_tier = normalizeText(user.membership_tier).toLowerCase();
  if (user.is_member === 1 && user.membership_expires_at) {
    const expireTs = Date.parse(user.membership_expires_at);
    if (!Number.isNaN(expireTs) && expireTs <= Date.now()) {
      user.is_member = 0;
      user.membership_tier = '';
    }
  }
  user.membership_active = user.is_member;
  if (user.is_member === 1 && user.membership_tier !== 'pro' && user.membership_tier !== 'max') {
    user.membership_tier = 'pro';
  }
  if (user.is_member !== 1) {
    user.membership_tier = '';
  }
  user.level_no = Math.max(1, Number(user.level_no || 1));
  user.level_label = normalizeText(user.level_label, 'LV' + user.level_no);
  user.level_score = Number(user.level_score || 0);
  user.level_next_no = Math.max(user.level_no, Number(user.level_next_no || user.level_no));
  user.level_next_label = normalizeText(user.level_next_label, 'LV' + user.level_next_no);
  user.level_score_to_next = Math.max(0, Number(user.level_score_to_next || 0));
  user.level_progress_percent = Math.max(0, Math.min(100, Number(user.level_progress_percent || 0)));
  user.level_max_reached = Number(user.level_max_reached || 0);
  return levelUtils.decorateLevelUser(user);
}

function normalizeCircle(value) {
  const circle = normalizeObject(value, {
    id: 0,
    circle_name: ''
  });
  circle.id = Number(circle.id || 0);
  circle.circle_name = normalizeText(circle.circle_name);
  return circle;
}

function normalizeAddress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
    return null;
  }
  const address = normalizeObject(value, {
    latitude: 0,
    longitude: 0,
    address_detailed: ''
  });
  address.latitude = Number(address.latitude || 0);
  address.longitude = Number(address.longitude || 0);
  address.address_detailed = normalizeText(address.address_detailed);
  if (!address.address_detailed && !address.latitude && !address.longitude) {
    return null;
  }
  return address;
}

function normalizeTag(value) {
  const tag = normalizeObject(value, {
    id: 0,
    tags_name: ''
  });
  tag.id = Number(tag.id || 0);
  tag.tags_name = normalizeText(tag.tags_name);
  return tag;
}

function normalizeCommentChild(value) {
  const reply = normalizeObject(value, {
    id: 0,
    user_id: 0,
    user_name: '',
    user_avatar: '',
    comment_agent_id: 0,
    comment_agent_name: '',
    comment_content: '',
    comment_img_url: '',
    format_time: '',
    like_count: 0,
    is_like: false,
    imgList: []
  });
  reply.user_name = normalizeText(reply.user_name);
  reply.user_avatar = normalizeText(reply.user_avatar);
  reply.comment_agent_name = normalizeText(reply.comment_agent_name);
  reply.comment_content = normalizeText(reply.comment_content);
  reply.comment_img_url = normalizeText(reply.comment_img_url);
  reply.format_time = normalizeText(reply.format_time);
  reply.imgList = normalizeArray(reply.imgList).map(normalizeImageItem);
  return reply;
}

function normalizeCommentItem(value) {
  const comment = normalizeObject(value, {
    id: 0,
    user_id: 0,
    uid: 0,
    posts_user_id: 0,
    user_name: '',
    user_avatar: '',
    comment_content: '',
    comment_img_url: '',
    format_time: '',
    like_count: 0,
    is_like: false,
    child: [],
    imgList: []
  });
  comment.user_name = normalizeText(comment.user_name);
  comment.user_avatar = normalizeText(comment.user_avatar);
  comment.comment_content = normalizeText(comment.comment_content);
  comment.comment_img_url = normalizeText(comment.comment_img_url);
  comment.format_time = normalizeText(comment.format_time);
  comment.child = normalizeArray(comment.child).map(normalizeCommentChild);
  comment.imgList = normalizeArray(comment.imgList).map(normalizeImageItem);
  return comment;
}

function normalizeExceptionalItem(value) {
  const exceptional = normalizeObject(value, {
    user_avatar: '',
    exceptional_date: '',
    exceptional_price: 0,
    user: {}
  });
  exceptional.user_avatar = normalizeText(exceptional.user_avatar);
  exceptional.exceptional_date = normalizeText(exceptional.exceptional_date);
  exceptional.user = normalizeUser(exceptional.user);
  return exceptional;
}

function normalizeVideo(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const video = normalizeObject(value, {
    show_type: 0,
    video_url: '',
    video_thumb_url: ''
  });
  video.show_type = Number(video.show_type || 0);
  video.video_url = normalizeText(video.video_url);
  video.video_thumb_url = normalizeText(video.video_thumb_url);
  if (!video.video_url) {
    return null;
  }
  return video;
}

function normalizePostItem(value) {
  const post = normalizeObject(value, {
    id: 0,
    posts_content: '',
    format_time: '',
    images: [],
    tags: [],
    comment: [],
    exceptional: [],
    user: {},
    circle: {},
    address: null,
    video: null,
    comment_count: 0,
    like_count: 0,
    exceptional_count: 0
  });
  post.posts_content = normalizeText(post.posts_content);
  post.format_time = normalizeText(post.format_time);
  post.images = normalizeArray(post.images).map(normalizeImageItem).filter(function (item) {
    return !!item.img_url;
  });
  post.tags = normalizeArray(post.tags).map(normalizeTag).filter(function (item) {
    return !!item.tags_name;
  });
  post.comment = normalizeArray(post.comment).map(normalizeCommentItem);
  post.exceptional = normalizeArray(post.exceptional).map(normalizeExceptionalItem);
  post.user = normalizeUser(post.user);
  post.circle = normalizeCircle(post.circle);
  post.address = normalizeAddress(post.address);
  post.video = normalizeVideo(post.video);
  return post;
}

function normalizeStickyItem(value) {
  const sticky = normalizeObject(value, {
    id: 0,
    posts_content: '',
    imagea: {}
  });
  sticky.posts_content = normalizeText(sticky.posts_content);
  sticky.imagea = normalizeImageItem(sticky.imagea);
  return sticky;
}

function normalizeSearchCarouselItem(value) {
  if (typeof value === 'string') {
    return {
      search_content: value
    };
  }
  const item = normalizeObject(value, {
    search_content: ''
  });
  item.search_content = normalizeText(item.search_content || item.title || item.content, '');
  return item;
}

function logCommonError(scope, err) {
  try {
    console.error('[InfiniLink common:' + scope + ']', err);
  } catch (error) {}
}

function normalizeOperationAdImageUrl(url) {
  const value = normalizeText(url);
  if (!value) {
    return '';
  }

  if (/^https:\/\//i.test(value) || value.indexOf('/backend/static/illustrations/') === 0) {
    return value;
  }

  const localIllustration = value.match(/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/assets\/illustrations\/([^/?#]+)$/i);
  if (localIllustration && localIllustration[1]) {
    return '/backend/static/illustrations/' + localIllustration[1];
  }

  return value;
}

function normalizeOperationAd(value) {
  const ad = normalizeObject(value, {
    id: '',
    slot: 'feed_stream',
    title: '',
    subtitle: '',
    image_url: '',
    action_type: 'none',
    action_value: '',
    button_text: '立即查看',
    enabled: false,
    sort_order: 0
  });
  ad.title = normalizeText(ad.title);
  ad.subtitle = normalizeText(ad.subtitle);
  ad.image_url = normalizeOperationAdImageUrl(ad.image_url);
  ad.action_type = normalizeText(ad.action_type, 'none');
  ad.action_value = normalizeText(ad.action_value);
  ad.button_text = normalizeText(ad.button_text, '立即查看');
  ad.enabled = !!ad.enabled;
  return ad;
}

function normalizeOperationAdLoadOptions(options) {
  if (typeof options === 'string') {
    return {
      targetKey: options,
      multiple: false,
      visibleKey: '',
      resetIndexKey: '',
    };
  }

  const settings = normalizeObject(options, {
    targetKey: 'feedAdCard',
    multiple: false,
    visibleKey: '',
    resetIndexKey: '',
  });
  settings.targetKey = normalizeText(settings.targetKey, 'feedAdCard');
  settings.visibleKey = normalizeText(settings.visibleKey);
  settings.resetIndexKey = normalizeText(settings.resetIndexKey);
  settings.multiple = !!settings.multiple;
  return settings;
}

function isExternalOperationAdLink(value) {
  const link = normalizeText(value).toLowerCase();
  return link.indexOf('http://') === 0 || link.indexOf('https://') === 0;
}

function trackPageInteraction(source) {
  if (util && typeof util.recordUserInteraction === 'function') {
    util.recordUserInteraction(source);
  }
}

function flushPageInteraction(source) {
  if (util && typeof util.flushTrackedActiveUsage === 'function') {
    util.flushTrackedActiveUsage(source, true);
  }
}

/**
 * 查询用户是否有未读信息
 */
const getSysMessageCount = function () {
  return util.request(api.getSysMessageCountUrl).then(function (res) {
    return Number(res.data || 0);
  }).catch(function (err) {
    logCommonError('getSysMessageCount', err);
    return 0;
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
  }).catch(function (err) {
    logCommonError('getindexBannerList', err);
    that.setData({
      banner: [],
      swiperload: false
    })
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
    let items = normalizeArray(data.data).map(normalizePostItem);
    let args = {};
    if (items.length == 0) {
      args.isLastPage = true;
    } else {
      args.posts = normalizeArray(that.data.posts).concat(items);
      args.page = data.current_page;
      args.loadmoreShow = false;
      args.isLastPage = false;
    }
    args.topicload = false;
    that.setData(args)
  }).catch(function (err) {
    logCommonError('indexPosts', err);
    that.setData({
      topicload: false,
      loadmoreShow: false
    })
  })
}
// 热门标签帖子接口
const indexChoiceness = function () {
  let that = this;
  util.request(api.indexChoicenessUrl).then(function (res) {
    let args = {};
    args.sticky = normalizeArray(res.data).map(normalizeStickyItem);
    args.stickyload = false;
    that.setData(args)
  }).catch(function (err) {
    logCommonError('indexChoiceness', err);
    that.setData({
      sticky: [],
      stickyload: false
    })
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
      args.posts = normalizeArray(Array.isArray(res.data) ? res.data : [res.data]).map(normalizePostItem);
      args.topicload = false;
      that.setData(args);
    }
  })
}
// 关注接口
const actionFollow = function (userId) {
  return new Promise(function (resolve, reject) {
    const normalizedUserId = Number(userId);
    if (!normalizedUserId || normalizedUserId <= 0) {
      reject({
        status: false,
        message: '关注对象不存在'
      });
      return;
    }
    util.request(api.userFollowUrl, {
      posts_user_id: normalizedUserId
    }, "POST").then(function (res) {
      if (res.status) {
        resolve(res);
      } else {
        reject(res);
      }
    }).catch(function (err) {
      reject({
        status: false,
        message: err && err.message ? err.message : (typeof err === 'string' ? err : '关注失败，请稍后重试')
      });
    });
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
  }).catch((err) => {
    wx.showToast({
      title: err && err.message ? err.message : '关注失败，请稍后重试',
      icon: 'none',
      duration: 1500
    })
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
  }).catch((err) => {
    wx.showToast({
      title: err && err.message ? err.message : '关注失败，请稍后重试',
      icon: 'none',
      duration: 1500
    })
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
    args.searchText = normalizeArray(res.data).map(normalizeSearchCarouselItem).filter(function (item) {
      return !!item.search_content;
    });
    if (args.searchText.length <= 0) {
      args.searchText = [{
        search_content: '点我搜索'
      }];
    }
    that.setData(args);
  }).catch(function (err) {
    logCommonError('searchCarouselList', err);
    that.setData({
      searchText: [{
        search_content: '点我搜索'
      }]
    })
  })
}

const loadOperationAd = function (slot = 'feed_stream', options) {
  let that = this;
  const settings = normalizeOperationAdLoadOptions(options);
  return util.request(api.operationAdsUrl, {
    slot: slot
  }).then(function (res) {
    const ads = normalizeArray(res.data).map(normalizeOperationAd).filter(function (item) {
      return item.enabled && !!item.image_url;
    });
    const payload = {};
    payload[settings.targetKey] = settings.multiple ? ads : (ads.length > 0 ? ads[0] : null);
    if (settings.visibleKey) {
      payload[settings.visibleKey] = settings.multiple ? ads.length > 0 : !!payload[settings.targetKey];
    }
    if (settings.resetIndexKey) {
      payload[settings.resetIndexKey] = 0;
    }
    that.setData(payload);
    return ads;
  }).catch(function (err) {
    logCommonError('loadOperationAd', err);
    const payload = {};
    payload[settings.targetKey] = settings.multiple ? [] : null;
    if (settings.visibleKey) {
      payload[settings.visibleKey] = false;
    }
    if (settings.resetIndexKey) {
      payload[settings.resetIndexKey] = 0;
    }
    that.setData(payload);
    return [];
  })
}

const openOperationAd = function (input) {
  const ad = input && input.currentTarget && input.currentTarget.dataset ? input.currentTarget.dataset.ad : input;
  const normalizedAd = normalizeOperationAd(ad);
  if (!normalizedAd || !normalizedAd.enabled) {
    return;
  }

  if (normalizedAd.action_type !== 'none' && isExternalOperationAdLink(normalizedAd.action_value)) {
    wx.navigateTo({
      url: '/pages/web-view/index?url=' + encodeURIComponent(normalizedAd.action_value),
      fail: function () {
        wx.showToast({
          title: '链接暂时无法打开',
          icon: 'none'
        })
      }
    });
    return;
  }

  if (normalizedAd.action_type === 'path' && normalizedAd.action_value) {
    wx.navigateTo({
      url: normalizedAd.action_value,
      fail: function () {
        wx.switchTab({
          url: normalizedAd.action_value,
          fail: function () {
            wx.showToast({
              title: '页面暂时无法打开',
              icon: 'none'
            })
          }
        })
      }
    });
    return;
  }

  if (normalizedAd.action_type === 'webview' && normalizedAd.action_value) {
    wx.navigateTo({
      url: '/pages/web-view/index?url=' + encodeURIComponent(normalizedAd.action_value),
      fail: function () {
        wx.showToast({
          title: '链接暂时无法打开',
          icon: 'none'
        })
      }
    });
  }
}

const maybeShowSplashAd = function (slot = 'splash_screen') {
  const appInstance = getApp();
  if (appInstance && appInstance.globalData && appInstance.globalData.splashAdShown) {
    this.setData({
      showSplashAd: false,
      splashAdCard: null
    });
    return Promise.resolve([]);
  }

  return loadOperationAd.call(this, slot, {
    targetKey: 'splashAdCard',
    visibleKey: 'showSplashAd'
  }).then(function (ads) {
    if (ads.length > 0 && appInstance && appInstance.globalData) {
      appInstance.globalData.splashAdShown = true;
    }
    return ads;
  });
}

const closeSplashAd = function () {
  this.setData({
    showSplashAd: false
  });
}

const openSplashOperationAd = function () {
  const ad = this.data && this.data.splashAdCard ? this.data.splashAdCard : null;
  this.setData({
    showSplashAd: false
  });
  if (ad) {
    openOperationAd.call(this, ad);
  }
}

const onOperationAdSwiperChange = function (e) {
  this.setData({
    carouselAdIndex: Number(e && e.detail ? e.detail.current : 0)
  });
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
  }).catch(function (err) {
    logCommonError('userPlate', err);
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
        title: '遇到了一个未知错误，请联系 InfiniLink 官方客服反馈！',
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
        title: '遇到了一个未知错误，请联系 InfiniLink 官方客服反馈！',
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
  }).catch((err) => {
    wx.showToast({
      title: err && err.message ? err.message : '关注失败，请稍后重试',
      icon: 'none',
      duration: 1500
    })
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
    showTextarea: true,
    focus: true,
    commentId: commentId,
    replyUserId: replyUserId,
    replyName: replyName,
  })
}
// 关闭评论输入框
const shutCommentShow = function () {
  this.setData({
    showTextarea: false,
    focus: false,
    commentId: "",
    replyUserId: "",
    replyName: "说点什么",
  })
}
//评论Input监听/发送评论
const onInputComment = function (e) {
  let that = this;
  var value = (e.detail.value || '').trim();
  let imageValue = that.data.imageValue;
  let postsId = Number(that.data.postsId || 0);
  let commentId = that.data.commentId;
  let replyUserId = that.data.replyUserId;
  if (!postsId) {
    wx.showToast({
      title: '评论对象不存在',
      icon: 'none',
      duration: 1500
    })
    return;
  }
  if (!value && !imageValue) {
    wx.showToast({
      title: '说点什么再发送吧',
      icon: 'none',
      duration: 1500
    })
    return;
  }
  wx.showLoading({
    title: ' ',
  })
  util.request(api.commentAddUrl, {
    posts_id: postsId,
    comment_content: value,
    comment_img_url: imageValue,
    comment_id: commentId,
    reply_user_id: replyUserId,
  }, "POST").then(function (res) {
    if (res.status) {
      that.setData({
        showTextarea: false,
        focus: false,
        inputValue: '',
        imageValue: '',
        commentId: '',
        replyUserId: '',
        replyName: '说点什么',
      })
      if (res.data && res.data.moderated) {
        wx.showToast({
          title: '您的评论存在违规，已为您下架处理',
          icon: 'none',
          duration: 2200
        })
        return;
      }
      wx.showToast({
        title: '评论成功！',
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
    }
  }).catch(function (err) {
    wx.showToast({
      title: err && err.message ? err.message : (typeof err === 'string' ? err : '评论失败，请稍后重试'),
      icon: 'none',
      duration: 1500
    })
  }).finally(function () {
    wx.hideLoading();
  })
}
//添加评论图片
const addCommentPic = function (e) {
  this.uploadPictures(1, e.currentTarget.dataset.name);
  this.setData({
    showTextarea: false,
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
              text: "InfiniLink，连接圈子、内容与灵感",
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
              text: "InfiniLink，连接圈子、内容与灵感",
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
        title: '生成海报失败了，请联系 InfiniLink 官方客服反馈！',
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
  obj.data = Object.assign({}, DEFAULT_PAGE_DATA, obj.data || {});

  const originalOnShow = obj.onShow;
  const originalOnHide = obj.onHide;
  const originalOnUnload = obj.onUnload;
  const originalOnPageScroll = obj.onPageScroll;

  obj.onShow = function () {
    trackPageInteraction('page_show');
    if (typeof originalOnShow === 'function') {
      return originalOnShow.apply(this, arguments);
    }
  };

  obj.onHide = function () {
    flushPageInteraction('page_hide');
    if (typeof originalOnHide === 'function') {
      return originalOnHide.apply(this, arguments);
    }
  };

  obj.onUnload = function () {
    flushPageInteraction('page_unload');
    if (typeof originalOnUnload === 'function') {
      return originalOnUnload.apply(this, arguments);
    }
  };

  obj.onPageScroll = function () {
    const now = Date.now();
    if (!this.__lastActivityScrollAt || now - this.__lastActivityScrollAt > 1500) {
      this.__lastActivityScrollAt = now;
      trackPageInteraction('scroll');
    }
    if (typeof originalOnPageScroll === 'function') {
      return originalOnPageScroll.apply(this, arguments);
    }
  };

  obj.onUserTouchActivity = function () {
    const now = Date.now();
    if (!this.__lastActivityTouchAt || now - this.__lastActivityTouchAt > 1000) {
      this.__lastActivityTouchAt = now;
      trackPageInteraction('touch');
    }
  };

  obj.onUserInputActivity = function () {
    trackPageInteraction('input');
  };

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
  obj.loadOperationAd = loadOperationAd;
  obj.openOperationAd = openOperationAd;
  obj.maybeShowSplashAd = maybeShowSplashAd;
  obj.closeSplashAd = closeSplashAd;
  obj.openSplashOperationAd = openSplashOperationAd;
  obj.onOperationAdSwiperChange = onOperationAdSwiperChange;
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
