import React, { useRef } from 'react';
import { createParser, EventSourceMessage } from 'eventsource-parser';
import { useDispatch, useSelector } from 'react-redux';
import {
  pushThinkContent,
  pushToolContent,
  pushUserContent,
  endStreamStatus,
  endThinkingMessageStatus,
  setChatController,
  pushSystemContent,
  setToolFunctionCall,
  setToolFunctionResponse,
  stopStreamChat,
  toggelSSELoading,
  setSessionId
} from './aiAgentSlice';
import { generateFileReq, generateTextReq, saveHistoryInLocalStorage } from './utils';
import { UUID } from 'uuidjs';
import {
  INTERACTION_FILE_ZH,
  INTERACTION_TEXT_ZH,
  INTERACTION_TYPE,
  INTERACTION_WEBSEARCH_ZH,
  MESSAGE_TYPE,
  MODE_TYPE,
  SSE_EVENT_TYPE
} from './const';
import _ from 'lodash';
import { Message } from '@ali/deep';
import { RootState } from './store';
import { HistoryItem } from './interface';

const initEventType = () => {
  return {
    uuid: UUID.generate(),
    type: SSE_EVENT_TYPE.MESSAGE,
    preType: SSE_EVENT_TYPE.MESSAGE
  };
};

// 有效的交互类型
export const EffectiveFucntionCall = [INTERACTION_TEXT_ZH, INTERACTION_FILE_ZH, INTERACTION_WEBSEARCH_ZH];

export function useChatSSE() {
  const controllerRef = useRef<AbortController>();
  const eventTypeRef = useRef<{ uuid: string; type: SSE_EVENT_TYPE; preType: SSE_EVENT_TYPE }>(
    initEventType()
  );
  const { sessionId } = useSelector((state: RootState) => state.aiAgent);

  const dispatch = useDispatch();

  const toggleEventType = (eventType: SSE_EVENT_TYPE) => {
    let id = null;
    let preType = eventTypeRef.current.preType;
    if (eventTypeRef.current.type === eventType) {
      id = eventTypeRef.current.uuid;
    } else {
      id = UUID.generate();
      preType = eventTypeRef.current.type;
      eventTypeRef.current = {
        uuid: id,
        type: eventType,
        preType
      };
    }
    return { id, preType };
  };

  const doneStreamHandle = (data: string) => {
    if (data === '[DONE]') {
      // 结束
      eventTypeRef.current = initEventType();
      dispatch(endStreamStatus());
      return true;
    }
    return false;
  };

  const functionCallHandle = (
    cardResultRelatedId: string,
    sessionId: string,
    data: string,
    queryText: string
  ) => {
    const { content } = JSON.parse(data);
    const functionCall = content?.parts?.[0]?.functionCall;
    if (functionCall) {
      toggleEventType(SSE_EVENT_TYPE.MESSAGE);
      const { name } = functionCall;
      if (EffectiveFucntionCall.includes(name)) {
        dispatch(
          setToolFunctionCall({
            ...functionCall,
            historyData: queryText,
            sessionId,
            cardResultRelatedId
          })
        );
      }
    }
  };

  const functionResponseHandle = (cardResultRelatedId: string, sessionId: string, data: string) => {
    const { content } = JSON.parse(data);
    const functionResponse = content?.parts?.[0]?.functionResponse;
    if (functionResponse) {
      toggleEventType(SSE_EVENT_TYPE.MESSAGE);
      const { name } = functionResponse;
      if (EffectiveFucntionCall.includes(name)) {
        dispatch(setToolFunctionResponse({ ...functionResponse, sessionId, cardResultRelatedId }));
      }
    }
  };

  const textHandle = (sessionId: string, data: string, isWebSearch: boolean) => {
    const { content } = JSON.parse(data);
    if (content?.parts?.[0]?.text) {
      const text = content.parts[0].text;
      const { id, preType } = toggleEventType(SSE_EVENT_TYPE.MESSAGE);
      let type = MESSAGE_TYPE.THINKING;
      if (preType === SSE_EVENT_TYPE.INTERACTION) {
        // 前一个是交互，当前就是总结
        type = MESSAGE_TYPE.SUMMARIZE;
      }
      // 思考内容
      dispatch(pushThinkContent({ id, text, type, isShow: !isWebSearch, sessionId }));
    }
  };

  // 消息类型解析器
  const messageEventHandle = (
    sessionId: string,
    data: string,
    isWebSearch: boolean,
    queryText: string,
    cardResultRelatedId: string
  ) => {
    try {
      const isDone = doneStreamHandle(data);
      if (isDone) {
        return;
      }
      functionCallHandle(cardResultRelatedId, sessionId, data, queryText);
      functionResponseHandle(cardResultRelatedId, sessionId, data);
      textHandle(sessionId, data, isWebSearch);
    } catch (error) {
      console.error(`${SSE_EVENT_TYPE.MESSAGE} 处理错误：`, error);
    }
  };

  // 交互类型解析器
  const interActionEventHandle = (
    sessionId: string,
    data: string,
    updateWebSearch: (flag: boolean) => void,
    saveCardResultRelatedId: (cardResultRelatedId: string) => void
  ) => {
    try {
      const content = JSON.parse(data);
      if (!_.isEmpty(content)) {
        if (content.type === INTERACTION_TYPE.PRORESS) {
          const { id, preType } = toggleEventType(SSE_EVENT_TYPE.INTERACTION);
          if (preType === SSE_EVENT_TYPE.MESSAGE) {
            // 到了工具，思考内容结束
            dispatch(endThinkingMessageStatus());
          }
          let cardResultId = UUID.generate();
          saveCardResultRelatedId(cardResultId);
          dispatch(pushToolContent({ id, content, sessionId, cardResultId }));
        } else if (content.type === INTERACTION_TYPE.WEBSEARCH) {
          updateWebSearch(true);
        }
      }
    } catch (error) {
      console.error(`${SSE_EVENT_TYPE.INTERACTION} 处理错误：`, error);
    }
  };

  // 系统类型解析器
  const systemEventHandel = (data: string) => {
    dispatch(pushSystemContent(data));
  };

  const fetchSSE = async (data: any, cb?: (sessionId: string) => void) => {
    if (!_.isEmpty(sessionId)) {
      data.sessionId = sessionId;
    }
    try {
      eventTypeRef.current = initEventType();
      controllerRef.current = new AbortController();
      dispatch(toggelSSELoading(true));
      dispatch(setChatController(controllerRef.current));
      const response = await fetch('/chat/invokeStream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          agent: 'always'
        },
        body: JSON.stringify(data),
        signal: controllerRef.current.signal
      });
      if (!response.ok || !response.body) {
        Message.error(response.status === 504 ? '请求chat接口超时' : '请求chat接口错误');
        throw new Error();
      }
      const reader = response.body.getReader();
      let isWebSearch = false;
      let cardResultRelatedId = '';
      const sessionId = UUID.generate();

      const parser = createParser({
        onEvent: (event: EventSourceMessage) => {
          cb?.(event.id!);
          if (event.event !== SSE_EVENT_TYPE.SYSTEM) {
            // 系统错误没有id返回
            dispatch(setSessionId(event.id));
          }
          switch (event.event) {
            case SSE_EVENT_TYPE.MESSAGE:
              return messageEventHandle(
                sessionId,
                event.data,
                isWebSearch,
                data.inputs[0].content,
                cardResultRelatedId
              );
            case SSE_EVENT_TYPE.INTERACTION:
              return interActionEventHandle(
                sessionId,
                event.data,
                (flag: boolean) => {
                  isWebSearch = flag;
                },
                (id: string) => {
                  cardResultRelatedId = id;
                }
              );
            case SSE_EVENT_TYPE.SYSTEM:
              return systemEventHandel(event.data);
            default:
              return;
          }
        }
      });
      reader
        .read()
        .then(function processText({ done, value }) {
          if (done) {
            parser.reset();
            return;
          }
          const text = new TextDecoder().decode(value, { stream: true });
          parser.feed(text);
          return reader.read().then(processText as any);
        })
        .catch(error => {
          console.error('网络连接中断', error);
          // @ts-ignore
          dispatch(stopStreamChat());
          return Promise.reject();
        });
    } catch (error) {
      if (controllerRef.current!.signal.aborted) {
        console.error('fetchSSE', error);
      } else {
        Message.error('请求连接中断');
      }
      // @ts-ignore
      dispatch(stopStreamChat());
    }
  };

  const sendTextChat = async (data: string) => {
    dispatch(pushUserContent(data));
    fetchSSE(generateTextReq(data));
  };

  const sendFileChat = async (data: any) => {
    let eventId = '';
    if (data) {
      fetchSSE(generateFileReq(data), (sessionId: string) => {
        if (!eventId) {
          const historyItem: HistoryItem = {
            id: UUID.generate(),
            mode: MODE_TYPE.FILE,
            query: data.fileName,
            timestamp: new Date().valueOf(),
            fileInfo: data,
            sessionId
          };
          saveHistoryInLocalStorage(historyItem);
          eventId = sessionId;
        }
      });
    }
  };

  return {
    sendTextChat,
    sendFileChat
  };
}
