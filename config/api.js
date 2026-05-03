const ApiRootUrl = 'http://127.0.0.1/api/v1/'; //v1接口
const PcApiRootUrl = 'http://127.0.0.1/api/v1/'; //PC接口
module.exports = {
  // 用户
  loginUrl: ApiRootUrl + 'login', //登录接口
  userInfoUrl: ApiRootUrl + 'user/info', //用户信息接口
  updateInfoUrl: ApiRootUrl + 'user/update/info', //修改用户信息接口
  userFollowUrl: ApiRootUrl + 'user/follow', //用户关注接口
  userPostsUrl: ApiRootUrl + 'user/posts', //用户相关帖子接口
  userTotalPostUrl: ApiRootUrl + 'user/totalPost', //用户相关帖子count接口
  userFeedbackUrl: ApiRootUrl + 'feedback/add', //用户反馈接口
  userAuthenticationUrl: ApiRootUrl + 'user/authentication', //用户认证接口
  userCricleUrl: ApiRootUrl + 'user/cricle', //用户创建的圈子列表接口
  getUserinfoByIdUrl: ApiRootUrl + 'user/info/byUserId', //通过用户id获取用户公开信息接口
  userPostsByIdUrl: ApiRootUrl + 'user/posts/byUserId', //通过用户id获取用户动态接口
  followUserUrl: ApiRootUrl + 'user/followUser', //关注列表接口
  fansUserUrl: ApiRootUrl + 'user/fansUser', //粉丝列表接口
  myOrderUrl: ApiRootUrl + 'user/myOrder', //用户订单列表接口
  myFinancialUrl: ApiRootUrl + 'user/myFinancial', //用户订单列表接口
  initiateWithdrawalUrl: ApiRootUrl + 'user/initiateWithdrawal', //用户发起提现接口
  myUserWithdrawalUrl: ApiRootUrl + 'user/myUserWithdrawal', //用户提现列表接口
  myUserExceptionalUrl: ApiRootUrl + 'user/myUserExceptional', //用户收益列表接口
  freeGetVipUrl: ApiRootUrl + 'user/freeGetVip', //免费领取会员接口

  // 圈子
  optionsListUrl: ApiRootUrl + 'posts/plate/options', //板块列表接口
  addCircleUrl: ApiRootUrl + 'posts/add/circle', //创建/修改圈子接口
  plateListUrl: ApiRootUrl + 'posts/plate/list', //板块列表接口
  circleByplateidUrl: ApiRootUrl + 'posts/circle/byplateid', //通过板块ID获取圈子接口
  circleSearchUrl: ApiRootUrl + 'posts/circle/search', //搜索圈子接口
  circleRecommendUrl: ApiRootUrl + 'circle/recommend', //推荐圈子4接口
  circleNotUrl: ApiRootUrl + 'circle/hot', //热门圈子接口
  circleCircleAndPostsUrl: ApiRootUrl + 'circle/circleAndPosts', //全部推荐圈子接口
  userFollowCircleListUrl: ApiRootUrl + 'user/follow/CircleList', //用户关注圈子列表接口
  userFollowCircleUrl: ApiRootUrl + 'user/follow/circle', //用户关注圈子接口
  circleInfoUrl: ApiRootUrl + 'circle/info', //圈子详情接口
  postsByCircleIdUrl: ApiRootUrl + 'posts/byCircleId', //圈子帖子接口
  userAuditPostsUrl: ApiRootUrl + 'user/auditPosts', //审核帖子接口
  getCircleUserListUrl: ApiRootUrl + 'circle/getCircleUserList', //圈子关注用户列表接口
  //帖子
  tagsRecommendUrl: ApiRootUrl + 'tags/recommend', //发帖时推荐的标签列表接口
  tagsAddUrl: ApiRootUrl + 'tags/add', //添加标签接口
  postAddUrl: ApiRootUrl + 'post/add', //发帖接口
  postsLikeUrl: ApiRootUrl + 'posts/like', //发帖喜欢接口
  postsCollectUrl: ApiRootUrl + 'posts/collect', //发帖收藏接口
  postsDeleteUrl: ApiRootUrl + 'posts/delete', //删除帖子接口
  postsDetailUrl: ApiRootUrl + 'posts/detail', //帖子详情接口
  commentAddUrl: ApiRootUrl + 'comment/add', //发表评论接口
  commentByPostsIdUrl: ApiRootUrl + 'comment/byPostsId', //通过动态id获取评论列表接口
  commentLikeAddUrl: ApiRootUrl + 'comment/like/add', //点赞评论接口
  commentDeleteAddUrl: ApiRootUrl + 'comment/delete', //删除评论接口
  getExceptionalListUrl: ApiRootUrl + 'posts/getExceptionalList', //打赏列表接口
  // 首页
  indexBannerUrl: ApiRootUrl + 'index/banner', //轮播图接口
  indexPostsUrl: ApiRootUrl + 'index/posts', //推荐帖子接口
  indexChoicenessUrl: ApiRootUrl + 'index/choiceness', //推荐精选帖子接口
  indexSearchUrl: ApiRootUrl + 'index/search', //搜索接口
  searchCountUrl: ApiRootUrl + 'search/count', //搜索个数量接口
  searchHotListUrl: ApiRootUrl + 'search/hot/list', //热门搜索接口
  tagsHotUrl: ApiRootUrl + 'tags/hot', //全部热门标签接口
  postsTageUrl: ApiRootUrl + 'posts/tags', //标签获取帖子列表(瀑布流)接口
  userPlateUrl: ApiRootUrl + 'user/plate', //用户板块列表接口
  userPlateAddUrl: ApiRootUrl + 'user/plate/add', //用户添加板块接口
  userPlateDeleteUrl: ApiRootUrl + 'user/plate/delete', //用户删除板块接口
  postsTageV2Url: ApiRootUrl + 'posts/tagsv2', //标签获取帖子列表接口
  searchCarouselListUrl: ApiRootUrl + 'search/carousel/list', //首页轮播搜索关键词列表接口
  mySearchListUrl: ApiRootUrl + 'search/my/list', //用户搜索记录列表接口
  myDelSearchUrl: ApiRootUrl + 'user/myDelSearch', //用户删除搜索记录接口
  myDelAllSearchUrl: ApiRootUrl + 'user/myDelAllSearch', //用户删除全部搜索记录接口

  // 消息
  getMessagesUrl: ApiRootUrl + 'massages/info', //消息页数据接口
  getDetailsMessagesUrl: ApiRootUrl + 'massages/getDetailsMessages', //通知详情页数据接口
  readMessagesUrl: ApiRootUrl + 'massages/readMessages', //已读对应类通知接口
  addChatUrl: ApiRootUrl + 'massages/addChat', //发起聊天接口
  getUserChatUrl: ApiRootUrl + 'massages/getUserChat', //查询用户聊天记录接口
  getUserChatListUrl: ApiRootUrl + 'massages/getUserChatList', //查询用户聊天记录列表接口
  readUserChatUrl: ApiRootUrl + 'massages/readUserChat', //已读对应用户信息接口
  getSysMessageCountUrl: ApiRootUrl + 'massages/getSysMessageCount', //查询用户是否有未读信息
  userDelMessageUrl: ApiRootUrl + 'massages/userDelMessage', //用户删除聊天记录
  //支付
  orderUrl: ApiRootUrl + 'order', //POST发起订单接口
  getMembersPriceUrl: ApiRootUrl + 'getMembersPrice', //获取开通会员信息接口

  // 公共接口
  postsMakeShowQcodeUrl: ApiRootUrl + 'posts/makeShowQcode', //生成海报
  uploadsUrl: ApiRootUrl + 'files/uploads', //上传文件接口
  getClauseDetailUrl: ApiRootUrl + 'common/getClauseDetail', //条款接口
  configDatalUrl: ApiRootUrl + 'configData', //配置数据接口

  //PC
  pcLoginUrl: PcApiRootUrl + 'wx_login', //同意授权PC登录
};