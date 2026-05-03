package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth/verifiers"
	"github.com/wechatpay-apiv3/wechatpay-go/core/downloader"
	wnotify "github.com/wechatpay-apiv3/wechatpay-go/core/notify"
	"github.com/wechatpay-apiv3/wechatpay-go/core/option"
	apppay "github.com/wechatpay-apiv3/wechatpay-go/services/payments/app"
	jsapi "github.com/wechatpay-apiv3/wechatpay-go/services/payments/jsapi"
	"github.com/wechatpay-apiv3/wechatpay-go/utils"
)

type wechatPayRuntime struct {
	client        *core.Client
	notifyHandler *wnotify.Handler
}

func (s *Server) wechatPayReady() bool {
	return strings.TrimSpace(s.cfg.WeChatAppID) != "" &&
		strings.TrimSpace(s.cfg.WeChatPayMchID) != "" &&
		strings.TrimSpace(s.cfg.WeChatPayAPIv3Key) != "" &&
		strings.TrimSpace(s.cfg.WeChatPaySerialNo) != "" &&
		strings.TrimSpace(s.cfg.WeChatPayKeyPEM) != "" &&
		strings.TrimSpace(s.cfg.WeChatPayNotify) != ""
}

func (s *Server) loadWechatPayRuntime(ctx context.Context) (*wechatPayRuntime, error) {
	if !s.wechatPayReady() {
		return nil, errors.New("微信支付配置不完整，请先设置商户参数")
	}

	privateKey, err := utils.LoadPrivateKey(strings.TrimSpace(s.cfg.WeChatPayKeyPEM))
	if err != nil {
		return nil, fmt.Errorf("加载微信支付私钥失败: %w", err)
	}

	client, err := core.NewClient(ctx,
		option.WithWechatPayAutoAuthCipher(
			strings.TrimSpace(s.cfg.WeChatPayMchID),
			strings.TrimSpace(s.cfg.WeChatPaySerialNo),
			privateKey,
			strings.TrimSpace(s.cfg.WeChatPayAPIv3Key),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("初始化微信支付客户端失败: %w", err)
	}

	manager := downloader.MgrInstance()
	if !manager.HasDownloader(ctx, strings.TrimSpace(s.cfg.WeChatPayMchID)) {
		if err := manager.RegisterDownloaderWithPrivateKey(
			ctx,
			privateKey,
			strings.TrimSpace(s.cfg.WeChatPaySerialNo),
			strings.TrimSpace(s.cfg.WeChatPayMchID),
			strings.TrimSpace(s.cfg.WeChatPayAPIv3Key),
		); err != nil {
			return nil, fmt.Errorf("初始化微信证书下载器失败: %w", err)
		}
	}

	notifyHandler, err := wnotify.NewRSANotifyHandler(
		strings.TrimSpace(s.cfg.WeChatPayAPIv3Key),
		verifiers.NewSHA256WithRSAVerifier(manager.GetCertificateVisitor(strings.TrimSpace(s.cfg.WeChatPayMchID))),
	)
	if err != nil {
		return nil, fmt.Errorf("初始化微信回调校验器失败: %w", err)
	}

	return &wechatPayRuntime{
		client:        client,
		notifyHandler: notifyHandler,
	}, nil
}

func (s *Server) createWechatPayIntent(ctx context.Context, userID int64, order orderRow, platform, description string) (map[string]any, string, error) {
	runtime, err := s.loadWechatPayRuntime(ctx)
	if err != nil {
		return nil, "", err
	}

	total := moneyToCents(order.OrderPayPrice)
	if total <= 0 {
		return nil, "", errors.New("订单金额必须大于 0")
	}

	if normalizePayPlatform(platform) == "app" {
		svc := apppay.AppApiService{Client: runtime.client}
		resp, _, err := svc.PrepayWithRequestPayment(ctx, apppay.PrepayRequest{
			Appid:       core.String(strings.TrimSpace(s.cfg.WeChatAppID)),
			Mchid:       core.String(strings.TrimSpace(s.cfg.WeChatPayMchID)),
			Description: core.String(firstNonEmpty(description, defaultPaymentDescription(order.OrderType))),
			OutTradeNo:  core.String(order.OrderNumber),
			NotifyUrl:   core.String(strings.TrimSpace(s.cfg.WeChatPayNotify)),
			Amount: &apppay.Amount{
				Total: core.Int64(total),
			},
		})
		if err != nil {
			return nil, "", fmt.Errorf("创建微信 App 支付失败: %w", err)
		}
		return map[string]any{
			"gateway":   "wechat",
			"platform":  "app",
			"appId":     strings.TrimSpace(s.cfg.WeChatAppID),
			"partnerId": stringPtr(resp.PartnerId),
			"prepayId":  stringPtr(resp.PrepayId),
			"timeStamp": stringPtr(resp.TimeStamp),
			"nonceStr":  stringPtr(resp.NonceStr),
			"package":   stringPtr(resp.Package),
			"sign":      stringPtr(resp.Sign),
		}, order.OrderNumber, nil
	}

	openID, err := s.lookupWechatOpenID(ctx, userID)
	if err != nil {
		return nil, "", fmt.Errorf("读取微信 openid 失败: %w", err)
	}
	if openID == "" {
		return nil, "", errors.New("当前账号缺少微信 openid，请重新登录后再发起支付")
	}

	svc := jsapi.JsapiApiService{Client: runtime.client}
	resp, _, err := svc.PrepayWithRequestPayment(ctx, jsapi.PrepayRequest{
		Appid:       core.String(strings.TrimSpace(s.cfg.WeChatAppID)),
		Mchid:       core.String(strings.TrimSpace(s.cfg.WeChatPayMchID)),
		Description: core.String(firstNonEmpty(description, defaultPaymentDescription(order.OrderType))),
		OutTradeNo:  core.String(order.OrderNumber),
		NotifyUrl:   core.String(strings.TrimSpace(s.cfg.WeChatPayNotify)),
		Amount: &jsapi.Amount{
			Total: core.Int64(total),
		},
		Payer: &jsapi.Payer{
			Openid: core.String(openID),
		},
	})
	if err != nil {
		return nil, "", fmt.Errorf("创建微信小程序支付失败: %w", err)
	}

	return map[string]any{
		"gateway":   "wechat",
		"platform":  "mini_program",
		"appId":     stringPtr(resp.Appid),
		"timeStamp": stringPtr(resp.TimeStamp),
		"nonceStr":  stringPtr(resp.NonceStr),
		"package":   stringPtr(resp.Package),
		"signType":  stringPtr(resp.SignType),
		"paySign":   stringPtr(resp.PaySign),
		"prepayId":  stringPtr(resp.PrepayId),
	}, order.OrderNumber, nil
}

func (s *Server) handleWechatPayNotify(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	rawBody, err := io.ReadAll(r.Body)
	if err != nil {
		writePaymentCallbackAck(w, "wechat", false)
		return
	}
	defer r.Body.Close()

	runtime, err := s.loadWechatPayRuntime(ctx)
	if err != nil {
		writePaymentCallbackAck(w, "wechat", false)
		return
	}

	req := r.Clone(ctx)
	req.Body = io.NopCloser(bytes.NewReader(rawBody))
	content := map[string]any{}
	notifyReq, err := runtime.notifyHandler.ParseNotifyRequest(ctx, req, content)
	if err != nil {
		writePaymentCallbackAck(w, "wechat", false)
		return
	}
	if notifyReq != nil && notifyReq.Resource != nil && strings.TrimSpace(notifyReq.Resource.Plaintext) != "" {
		_ = json.Unmarshal([]byte(notifyReq.Resource.Plaintext), &content)
		rawBody = []byte(notifyReq.Resource.Plaintext)
	}

	orderNumber := firstNonEmpty(anyString(content["out_trade_no"]))
	providerOrderID := firstNonEmpty(anyString(content["transaction_id"]), orderNumber)
	tradeState := strings.ToUpper(strings.TrimSpace(firstNonEmpty(anyString(content["trade_state"]), anyString(content["state"]))))

	callbackID, _ := s.recordPaymentCallback(ctx, "wechat", orderNumber, providerOrderID, tradeState, true, rawBody)

	switch tradeState {
	case "SUCCESS":
		if err := s.markOrderPaid(ctx, orderNumber, "wechat", providerOrderID, content); err != nil {
			s.finishPaymentCallback(ctx, callbackID, "failed", err.Error())
			writePaymentCallbackAck(w, "wechat", false)
			return
		}
		s.finishPaymentCallback(ctx, callbackID, "success", "")
		writePaymentCallbackAck(w, "wechat", true)
	case "CLOSED", "REVOKED", "PAYERROR":
		s.markOrderFailed(ctx, orderNumber, "wechat", tradeState)
		s.finishPaymentCallback(ctx, callbackID, "success", "")
		writePaymentCallbackAck(w, "wechat", true)
	default:
		s.finishPaymentCallback(ctx, callbackID, "ignored", tradeState)
		writePaymentCallbackAck(w, "wechat", true)
	}
}

func stringPtr(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}
