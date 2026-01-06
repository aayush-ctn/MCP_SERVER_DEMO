export interface NewsArticle {
  _id: string;
  title: string;
  description: string;
  owner: string;
  link: string;
  tickers: string[];
  sentiment: "Positive" | "Negative" | "Neutral";
  posted_at: string;
}

export interface NewsResponse {
  data: {
    docs: NewsArticle[];
  };
}
