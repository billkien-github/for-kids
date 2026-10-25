import type { KidQuestionBody, QuestionBody } from '@for-kids/shared'
import { RichText } from '../RichText'
import { MultiChoice, SingleChoice, TrueFalse } from './ChoiceQuestions'
import { ColumnArith, FillBlank, Info, NumberInput, SplitStrategy } from './InputQuestions'
import { ClockSet, Matching, Ordering } from './InteractiveQuestions'

type Props = {
  body: KidQuestionBody | QuestionBody
  solution?: QuestionBody
  response: unknown
  onChange?: (response: unknown) => void
  lang: string
}

const noop = () => {}

/** Hiển thị một câu hỏi theo loại; có `solution` thì ở chế độ xem lại. */
export function QuestionView({ body, solution, response, onChange = noop, lang }: Props) {
  // solution cùng loại với body (cùng một câu), nên ép kiểu chung một lần ở đây.
  const props = { solution: solution as never, response, onChange, lang }
  // fill_blank vẽ ô trống ngay trong đề, nên tự hiện prompt.
  const showPrompt = body.type !== 'fill_blank' && body.prompt

  return (
    <div className="flex flex-col gap-5">
      {showPrompt && <RichText value={body.prompt!} lang={lang} className="text-2xl" clockSize={200} />}
      {(() => {
        switch (body.type) {
          case 'single_choice':
            return <SingleChoice body={body} {...props} />
          case 'multi_choice':
            return <MultiChoice body={body} {...props} />
          case 'true_false':
            return <TrueFalse body={body} {...props} />
          case 'fill_blank':
            return <FillBlank body={body} {...props} />
          case 'number_input':
            return <NumberInput body={body} {...props} />
          case 'matching':
            return <Matching body={body as never} {...props} />
          case 'ordering':
            return <Ordering body={body as never} {...props} />
          case 'split_strategy':
            return <SplitStrategy body={body} {...props} />
          case 'clock_set':
            return <ClockSet body={body as never} {...props} />
          case 'column_arith':
            return <ColumnArith body={body} {...props} />
          case 'info':
            return <Info body={body} {...props} />
        }
      })()}
    </div>
  )
}
