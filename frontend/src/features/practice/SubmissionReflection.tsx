import { useState } from 'react';
import type { PracticeReflectionRating, Submission } from '../../../../shared/src/types/practice';
import { api, errorMessage } from '../../app/api';

const ratings = {
  easy: 'Easy',
  manageable: 'Manageable',
  challenging: 'Challenging',
  reallyDifficult: 'Really difficult',
} satisfies Record<PracticeReflectionRating, string>;

export function SubmissionReflection({ submission, onSaved }: {
  submission: Submission; onSaved(id: string, rating: PracticeReflectionRating): void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function save(rating: PracticeReflectionRating) {
    setPending(true);
    setError('');
    try {
      const { data } = await api.post<{ rating: PracticeReflectionRating }>(
        '/practice/submissions/' + submission.id + '/reflection', { rating },
      );
      onSaved(submission.id, data.rating);
    } catch (failure) {
      setError(errorMessage(failure, 'Could not save your rating. Try again.'));
    } finally {
      setPending(false);
    }
  }

  return <fieldset className="submission-reflection" disabled={pending}>
    <legend>How difficult did this problem feel?</legend>
    {submission.reflectionRating ? <p className="muted" role="status">You rated this {ratings[submission.reflectionRating].toLowerCase()}.</p>
      : <div className="inline-controls">{(Object.keys(ratings) as PracticeReflectionRating[]).map((rating) =>
        <button className="button" key={rating} type="button" onClick={() => void save(rating)}>{ratings[rating]}</button>,
      )}</div>}
    {pending && <p className="muted" role="status">Saving your rating…</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </fieldset>;
}
