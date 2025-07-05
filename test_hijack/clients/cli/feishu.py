import os
import lark_oapi as lark
from lark_oapi.api.im.v1 import *
from dotenv import load_dotenv

# 加载 .env 文件中的环境变量
load_dotenv()

# 从环境变量中获取 App ID 和 App Secret
APP_ID = os.getenv("APP_ID")
APP_SECRET = os.getenv("APP_SECRET")

# 构建客户端
client = lark.Client.builder() \
    .app_id(APP_ID) \
    .app_secret(APP_SECRET) \
    .log_level(lark.LogLevel.DEBUG) \
    .build()

def send_text_message(receive_id_type: str, receive_id: str, message: str):
    """
    发送文本消息
    :param receive_id_type: 接收者ID类型，例如：open_id, user_id, union_id, email, chat_id
    :param receive_id: 接收者ID
    :param message: 要发送的文本消息
    """
    # 构造请求体
    request: CreateMessageRequest = CreateMessageRequest.builder() \
        .receive_id_type(receive_id_type) \
        .request_body(CreateMessageRequestBody.builder()
                      .receive_id(receive_id)
                      .msg_type("text")
                      .content(lark.JSON.marshal({"text": message}))
                      .build())
        .build()

    # 发送请求
    response: CreateMessageResponse = client.im.v1.message.create(request)

    # 处理响应
    if not response.success():
        lark.logger.error(
            f"client.im.v1.message.create failed, code: {response.code}, msg: {response.msg}, log_id: {response.log_id}")
        return

    lark.logger.info(lark.JSON.marshal(response.data, indent=4))

if __name__ == "__main__":
    # 使用示例
    # 请将下面的 receive_id 替换为有效的用户 open_id 或 chat_id 等
    # 您需要根据实际情况修改 receive_id_type 和 receive_id
    # 例如，发送给某个用户：
    # send_text_message("open_id", "ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxx", "你好，这是一条测试消息")
    
    # 或者发送到群聊：
    # send_text_message("chat_id", "oc_xxxxxxxxxxxxxxxxxxxxxxxxxxxx", "大家好，这是一条群测试消息")
    print("这是一个飞书客户端示例。")
    print("请在代码中取消注释并填入正确的 receive_id_type 和 receive_id 来发送消息。")
    # send_text_message("open_id", "ou_replace_with_your_open_id", "Hello from Gemini-CLI!")